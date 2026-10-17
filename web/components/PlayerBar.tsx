"use client";

import { useEffect, useRef, useState } from "react";
import { coverStyle, formatTime, type PlayItem } from "@/lib/client";
import {
  CloseIcon,
  DownloadIcon,
  LyricsIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  VolumeIcon,
} from "./icons";

interface Props {
  item: PlayItem | null;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
}

export function PlayerBar({ item, playing, onPlayingChange, onPrev, onNext, onEnded }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  // Load a new track whenever the selected item changes.
  useEffect(() => {
    const el = audio.current;
    if (!el || !item) return;
    if (el.src !== item.track.url) {
      el.src = item.track.url;
      setTime(0);
      setDuration(item.track.duration ?? 0);
    }
  }, [item]);

  // Drive the element from the `playing` prop.
  useEffect(() => {
    const el = audio.current;
    if (!el || !item) return;
    if (playing && el.paused) el.play().catch(() => onPlayingChange(false));
    if (!playing && !el.paused) el.pause();
  }, [playing, item, onPlayingChange]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume;
      audio.current.muted = muted;
    }
  }, [volume, muted]);

  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <>
      {showLyrics && item && (
        <aside className="lyrics-drawer" aria-label="歌詞">
          <header>
            <div>
              <div className="drawer-title">{item.title}</div>
              <div className="muted small">{item.job.song?.tags.join(" · ")}</div>
            </div>
            <button className="icon-btn" aria-label="關閉歌詞" onClick={() => setShowLyrics(false)}>
              <CloseIcon />
            </button>
          </header>
          <pre className="lyrics">{item.job.song?.lyrics ?? "（沒有歌詞）"}</pre>
        </aside>
      )}

      <footer className={item ? "player" : "player idle"}>
        <audio
          ref={audio}
          preload="metadata"
          onPlay={() => onPlayingChange(true)}
          onPause={() => onPlayingChange(false)}
          onEnded={onEnded}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />

        <div className="np">
          <div className="np-cover" style={coverStyle(item ? item.job.id + (item.version - 1) : "idle")} />
          <div className="np-text">
            <div className="np-title">
              {item ? item.title : "尚未播放"}
              {item && (item.job.tracks?.length ?? 0) > 1 && <span className="ver">v{item.version}</span>}
            </div>
            <div className="np-sub">{item?.job.song?.tags.slice(0, 3).join(" · ") ?? "選一首作品開始播放"}</div>
          </div>
        </div>

        <div className="transport">
          <div className="buttons">
            <button className="icon-btn" aria-label="上一首" onClick={onPrev} disabled={!item}>
              <PrevIcon />
            </button>
            <button
              className="play-btn"
              aria-label={playing ? "暫停" : "播放"}
              onClick={() => onPlayingChange(!playing)}
              disabled={!item}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button className="icon-btn" aria-label="下一首" onClick={onNext} disabled={!item}>
              <NextIcon />
            </button>
          </div>
          <div className="seek">
            <span className="time">{formatTime(time)}</span>
            <input
              type="range"
              className="slider thin"
              min={0}
              max={duration || 1}
              step={0.1}
              value={time}
              disabled={!item}
              aria-label="播放進度"
              style={{ "--pct": `${pct}%` } as React.CSSProperties}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTime(t);
                if (audio.current) audio.current.currentTime = t;
              }}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="extras">
          <button
            className={showLyrics ? "icon-btn on" : "icon-btn"}
            aria-label="歌詞"
            title="歌詞"
            disabled={!item}
            onClick={() => setShowLyrics((v) => !v)}
          >
            <LyricsIcon />
          </button>
          {item ? (
            <a className="icon-btn" href={item.track.downloadUrl} title="下載 MP3" aria-label="下載 MP3">
              <DownloadIcon />
            </a>
          ) : (
            <button className="icon-btn" disabled aria-label="下載 MP3">
              <DownloadIcon />
            </button>
          )}
          <div className="volume">
            <button className="icon-btn" aria-label={muted ? "取消靜音" : "靜音"} onClick={() => setMuted((m) => !m)}>
              {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              className="slider thin"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="音量"
              style={{ "--pct": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
            />
          </div>
        </div>
      </footer>
    </>
  );
}
