"use client";

import { useEffect, useState } from "react";
import { coverStyle, formatTime, type PlayItem } from "@/lib/client";
import type { Job } from "@/lib/types";
import {
  CloseIcon,
  DownloadIcon,
  LyricsIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  RetryIcon,
  TrashIcon,
} from "./icons";

const STAGES: Record<string, string> = {
  queued: "排隊中",
  composing: "作詞作曲中",
  rendering: "錄製中",
  uploading: "上傳中",
};
const STAGE_ORDER = ["queued", "composing", "rendering", "uploading"];

interface Props {
  jobs: Job[];
  loaded: boolean;
  currentKey: string | null;
  playing: boolean;
  onPlay: (item: PlayItem) => void;
  onRetry: (job: Job) => void;
  onRemove: (job: Job) => void;
}

export function Workspace({ jobs, loaded, currentKey, playing, onPlay, onRetry, onRemove }: Props) {
  const [lyricsFor, setLyricsFor] = useState<string | null>(null);

  return (
    <section className="workspace" aria-label="我的作品">
      <header className="ws-head">
        <h2>我的作品</h2>
        <span className="muted">{jobs.length > 0 ? `${jobs.length} 次生成` : ""}</span>
      </header>

      {loaded && jobs.length === 0 && (
        <div className="empty">
          <div className="empty-disc">
            <MusicIcon width={34} height={34} />
          </div>
          <p>還沒有作品，從左邊開始創作第一首歌吧！</p>
        </div>
      )}

      <ul className="songs">
        {jobs.map((job) =>
          job.status === "done" && job.tracks?.length ? (
            job.tracks.map((track, i) => {
              const item: PlayItem = {
                key: `${job.id}:${i}`,
                job,
                track,
                version: i + 1,
                title: job.song?.title ?? "未命名歌曲",
              };
              const isCurrent = currentKey === item.key;
              return (
                <li key={item.key} className={isCurrent ? "song current" : "song"}>
                  <button
                    className="cover"
                    style={coverStyle(job.id + i)}
                    onClick={() => onPlay(item)}
                    aria-label={isCurrent && playing ? "暫停" : `播放 ${item.title}`}
                  >
                    <span className="cover-icon">
                      {isCurrent && playing ? <PauseIcon /> : <PlayIcon />}
                    </span>
                    {isCurrent && playing && <Eq />}
                  </button>
                  <div className="song-main" onClick={() => onPlay(item)}>
                    <div className="song-title">
                      {item.title}
                      {job.tracks!.length > 1 && <span className="ver">v{item.version}</span>}
                    </div>
                    <div className="song-tags">
                      {(job.song?.tags ?? []).slice(0, 4).map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className="song-dur">
                    {formatTime(track.duration ?? job.input.duration)}
                  </span>
                  <div className="song-actions">
                    <button
                      className="icon-btn"
                      title="歌詞"
                      aria-label="歌詞"
                      onClick={() => setLyricsFor(lyricsFor === job.id ? null : job.id)}
                    >
                      <LyricsIcon />
                    </button>
                    <a className="icon-btn" title="下載 MP3" aria-label="下載 MP3" href={track.downloadUrl}>
                      <DownloadIcon />
                    </a>
                    {i === job.tracks!.length - 1 && (
                      <button
                        className="icon-btn subtle"
                        title="從列表移除"
                        aria-label="從列表移除"
                        onClick={() => onRemove(job)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  {lyricsFor === job.id && i === job.tracks!.length - 1 && (
                    <SongDetail job={job} onClose={() => setLyricsFor(null)} />
                  )}
                </li>
              );
            })
          ) : job.status === "failed" ? (
            <li key={job.id} className="song failed">
              <div className="cover" style={coverStyle(job.id)} />
              <div className="song-main">
                <div className="song-title">{job.song?.title ?? summarize(job)}</div>
                <div className="song-error">{job.error ?? "生成失敗"}</div>
              </div>
              <div className="song-actions">
                <button className="icon-btn" title="重新生成" aria-label="重新生成" onClick={() => onRetry(job)}>
                  <RetryIcon />
                </button>
                <button className="icon-btn subtle" title="從列表移除" aria-label="從列表移除" onClick={() => onRemove(job)}>
                  <TrashIcon />
                </button>
              </div>
            </li>
          ) : (
            <PendingRow key={job.id} job={job} />
          ),
        )}
      </ul>
    </section>
  );
}

function summarize(job: Job): string {
  const text = job.input.title || job.input.prompt || job.input.lyrics;
  return text.length > 28 ? `${text.slice(0, 28)}…` : text || "新歌曲";
}

function PendingRow({ job }: { job: Job }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const step = STAGE_ORDER.indexOf(job.status);
  const elapsed = Math.max(0, (now - (job.startedAt ?? job.createdAt)) / 1000);

  return (
    <li className="song pending">
      <div className="cover shimmer" style={coverStyle(job.id)}>
        <span className="spinner" aria-hidden />
      </div>
      <div className="song-main">
        <div className="song-title">{job.song?.title ?? summarize(job)}</div>
        <div className="stage">
          <span className="stage-dot" />
          {job.status === "queued" && job.queueAhead
            ? `排隊中，前面還有 ${job.queueAhead} 首`
            : job.stageText ?? STAGES[job.status]}
        </div>
        <div className="steps" aria-hidden>
          {STAGE_ORDER.map((s, i) => (
            <span key={s} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </div>
      </div>
      <span className="song-dur muted">{formatTime(elapsed)}</span>
    </li>
  );
}

function SongDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const song = job.song;
  if (!song) return null;
  return (
    <div className="detail">
      <button className="icon-btn detail-close" aria-label="關閉" onClick={onClose}>
        <CloseIcon />
      </button>
      {song.summary && <p className="detail-summary">{song.summary}</p>}
      <dl className="meta">
        <div><dt>BPM</dt><dd>{song.bpm}</dd></div>
        <div><dt>調性</dt><dd>{song.keyScale}</dd></div>
        <div><dt>引擎</dt><dd>{job.engine ?? "—"}</dd></div>
      </dl>
      <p className="detail-caption">{song.caption}</p>
      <pre className="lyrics">{song.lyrics}</pre>
    </div>
  );
}

function Eq() {
  return (
    <span className="eq" aria-hidden>
      <i /><i /><i /><i />
    </span>
  );
}
