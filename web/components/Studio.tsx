"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHealth,
  fetchJobs,
  isActive,
  loadAccessCode,
  loadJobIds,
  playItems,
  saveAccessCode,
  saveJobIds,
  submitJob,
  type Health,
  type PlayItem,
} from "@/lib/client";
import type { Job, JobInput } from "@/lib/types";
import { CreatePanel } from "./CreatePanel";
import { LibraryIcon, MusicIcon, SparkIcon } from "./icons";
import { PlayerBar } from "./PlayerBar";
import { Workspace } from "./Workspace";

const POLL_MS = 3000;
const HEALTH_MS = 30000;

export function Studio() {
  // null until localStorage has been read, so the empty state doesn't flash.
  const [ids, setIds] = useState<string[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [current, setCurrent] = useState<PlayItem | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIds(loadJobIds());
    setAccessCode(loadAccessCode());
  }, []);

  const refresh = useCallback(async (list: string[]) => {
    try {
      const fresh = await fetchJobs(list);
      const byId = new Map(fresh.map((j) => [j.id, j]));
      setJobs(list.map((id) => byId.get(id)).filter((j): j is Job => !!j));
    } catch {
      /* keep the last known state; the next poll retries */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (ids) refresh(ids);
  }, [ids, refresh]);

  // Poll only while something is still queued or generating.
  const anyActive = jobs.some(isActive);
  useEffect(() => {
    if (!ids || !anyActive) return;
    const t = setInterval(() => refresh(ids), POLL_MS);
    return () => clearInterval(t);
  }, [ids, anyActive, refresh]);

  useEffect(() => {
    const load = () => fetchHealth().then(setHealth).catch(() => setHealth(null));
    load();
    const t = setInterval(load, HEALTH_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const items = useMemo(() => playItems(jobs), [jobs]);

  async function create(input: JobInput) {
    setSubmitting(true);
    try {
      const job = await submitJob(input, accessCode);
      const next = [job.id, ...(ids ?? [])];
      saveJobIds(next);
      setJobs((js) => [job, ...js]);
      setIds(next);
      if (health && !health.workerOnline) {
        setToast("已加入排隊。生成服務目前離線，開機後會自動開始。");
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function remove(job: Job) {
    const next = (ids ?? []).filter((id) => id !== job.id);
    saveJobIds(next);
    setIds(next);
    setJobs((js) => js.filter((j) => j.id !== job.id));
    if (current?.job.id === job.id) {
      setCurrent(null);
      setPlaying(false);
    }
  }

  function play(item: PlayItem) {
    if (current?.key === item.key) {
      setPlaying((p) => !p);
    } else {
      setCurrent(item);
      setPlaying(true);
    }
  }

  function step(delta: number) {
    if (!current || items.length === 0) return;
    const idx = items.findIndex((i) => i.key === current.key);
    const next = items[(idx + delta + items.length) % items.length];
    setCurrent(next);
    setPlaying(true);
  }

  const onPlayingChange = useCallback((p: boolean) => setPlaying(p), []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">
            <MusicIcon width={18} height={18} />
          </span>
          曲匠 AI
        </div>
        <nav className="nav">
          <a className="nav-item active" href="#create">
            <SparkIcon /> 創作音樂
          </a>
          <a className="nav-item" href="#workspace">
            <LibraryIcon /> 我的作品
          </a>
        </nav>
        <WorkerStatus health={health} />
      </aside>

      <main className="main">
        <div className="panel create-col" id="create">
          <CreatePanel
            references={health?.references ?? []}
            submitting={submitting}
            accessCodeRequired={health?.accessCodeRequired ?? false}
            accessCode={accessCode}
            onAccessCodeChange={(c) => {
              setAccessCode(c);
              saveAccessCode(c);
            }}
            onSubmit={create}
          />
        </div>
        <div className="panel ws-col" id="workspace">
          <Workspace
            jobs={jobs}
            loaded={loaded}
            currentKey={current?.key ?? null}
            playing={playing}
            onPlay={play}
            onRetry={(job) => create(job.input)}
            onRemove={remove}
          />
        </div>
      </main>

      <PlayerBar
        item={current}
        playing={playing}
        onPlayingChange={onPlayingChange}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onEnded={() => (items.length > 1 ? step(1) : setPlaying(false))}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function WorkerStatus({ health }: { health: Health | null }) {
  const state = !health
    ? { cls: "unknown", text: "連線中…" }
    : !health.configured
      ? { cls: "off", text: "後端尚未設定" }
      : health.workerOnline
        ? { cls: "on", text: "生成服務在線" }
        : { cls: "off", text: "生成服務離線" };
  return (
    <div className="status-card">
      <div className={`status ${state.cls}`}>
        <span className="dot" />
        {state.text}
      </div>
      <p>
        {health?.workerOnline
          ? health.queued > 0
            ? `目前排隊 ${health.queued} 首`
            : "現在送出會馬上開始"
          : "仍可送出，服務上線後依序生成"}
      </p>
      <p className="powered">由 Claude 作詞作曲 · ACE-Step 演唱</p>
    </div>
  );
}
