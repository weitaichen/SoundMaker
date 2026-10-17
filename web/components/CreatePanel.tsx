"use client";

import { useState } from "react";
import { formatTime } from "@/lib/client";
import {
  DURATION_MAX,
  DURATION_MIN,
  type JobInput,
  type ReferenceStyle,
  type VocalGender,
  type VocalLanguage,
} from "@/lib/types";
import { MusicIcon, SparkIcon } from "./icons";

const IDEAS = [
  { label: "壘球隊應援歌", text: "幫我做一首壘球隊應援歌，隊名叫「閃電」，要熱血、節奏強，副歌有大家可以一起喊的口號" },
  { label: "生日快樂歌", text: "一首溫馨又有點俏皮的生日歌，送給今年滿 30 歲的好朋友小美" },
  { label: "畢業典禮", text: "畢業典禮用的感性流行歌，關於一起走過的三年、離別和對未來的期待" },
  { label: "公司尾牙", text: "公司尾牙開場用的嗨歌，電子舞曲風，歌詞關於大家一年來的努力和明年發大財" },
  { label: "讀書 Lo-fi", text: "適合深夜讀書的 lo-fi 純音樂，溫暖的電鋼琴、黑膠雜訊、慵懶的鼓" },
  { label: "婚禮進場", text: "婚禮新人進場用的浪漫歌曲，鋼琴與弦樂，溫柔的男女對唱" },
];

const STYLE_TAGS = [
  "熱血搖滾", "流行", "電子舞曲", "嘻哈", "抒情鋼琴", "管樂進行曲",
  "Lo-fi", "爵士", "民謠吉他", "K-pop", "City Pop", "史詩管弦",
];

const GENDERS: { value: VocalGender; label: string }[] = [
  { value: "auto", label: "自動" },
  { value: "female", label: "女聲" },
  { value: "male", label: "男聲" },
  { value: "duet", label: "對唱" },
  { value: "choir", label: "合唱" },
];

const LANGUAGES: { value: VocalLanguage; label: string }[] = [
  { value: "auto", label: "自動判斷" },
  { value: "zh", label: "中文（國語）" },
  { value: "yue", label: "粵語" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韓文" },
];

interface Props {
  references: ReferenceStyle[];
  submitting: boolean;
  accessCodeRequired: boolean;
  accessCode: string;
  onAccessCodeChange: (code: string) => void;
  onSubmit: (input: JobInput) => void;
}

export function CreatePanel(props: Props) {
  const [mode, setMode] = useState<"easy" | "custom">("easy");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState<VocalGender>("auto");
  const [language, setLanguage] = useState<VocalLanguage>("auto");
  const [duration, setDuration] = useState(120);
  const [reference, setReference] = useState("auto");
  const [quality, setQuality] = useState<"fast" | "best">("fast");

  const canSubmit =
    !props.submitting &&
    (mode === "easy" ? prompt.trim().length > 0 : (style + lyrics).trim().length > 0) &&
    (!props.accessCodeRequired || props.accessCode.trim().length > 0);

  function addStyleTag(tag: string) {
    setStyle((s) => (s.includes(tag) ? s : s ? `${s}、${tag}` : tag));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    props.onSubmit({
      mode,
      prompt: mode === "easy" ? prompt : style,
      lyrics: mode === "custom" && !instrumental ? lyrics : "",
      title: mode === "custom" ? title : "",
      instrumental,
      vocalGender,
      language,
      duration,
      reference,
      quality,
    });
  }

  return (
    <form className="create" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {(["easy", "custom"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "tab active" : "tab"}
            onClick={() => setMode(m)}
          >
            {m === "easy" ? "簡易" : "自訂"}
          </button>
        ))}
      </div>

      <div className="create-body">
        {mode === "easy" ? (
          <>
            <div className="intro">
              <h1>想做一首什麼樣的歌？</h1>
              <p>描述用途、主題、氣氛，Claude 會幫你寫詞、編曲，再由 AI 唱出來。</p>
            </div>
            <div className="field">
              <textarea
                className="input big"
                rows={5}
                maxLength={600}
                placeholder="例如：幫我做一首壘球隊應援歌，隊名叫「閃電」，要熱血、有口號可以一起喊"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="chips">
              {IDEAS.map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  className="chip"
                  onClick={() => setPrompt(idea.text)}
                >
                  {idea.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="field card">
              <div className="field-head">
                <label htmlFor="lyrics">歌詞</label>
                <Toggle checked={instrumental} onChange={setInstrumental} label="純音樂" />
              </div>
              <textarea
                id="lyrics"
                className="input bare"
                rows={7}
                maxLength={3000}
                disabled={instrumental}
                placeholder={
                  instrumental
                    ? "純音樂模式不需要歌詞"
                    : "輸入歌詞，可用 [主歌] [副歌] 標記段落；留空則由 Claude 作詞"
                }
                value={instrumental ? "" : lyrics}
                onChange={(e) => setLyrics(e.target.value)}
              />
            </div>
            <div className="field card">
              <div className="field-head">
                <label htmlFor="style">曲風</label>
              </div>
              <textarea
                id="style"
                className="input bare"
                rows={3}
                maxLength={600}
                placeholder="描述曲風、情緒、樂器，例如：熱血搖滾、電吉他、銅管、加油口號"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              />
              <div className="chips small">
                {STYLE_TAGS.map((t) => (
                  <button key={t} type="button" className="chip" onClick={() => addStyleTag(t)}>
                    + {t}
                  </button>
                ))}
              </div>
            </div>
            {!instrumental && (
              <div className="field row">
                <span className="label">人聲</span>
                <div className="segmented">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      className={vocalGender === g.value ? "seg active" : "seg"}
                      onClick={() => setVocalGender(g.value)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <div className="title-input">
                <input
                  className="input"
                  maxLength={50}
                  placeholder="歌名（留空由 Claude 命名）"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <span className="counter">{title.length}/50</span>
              </div>
            </div>
          </>
        )}

        <div className="field">
          <div className="field-head">
            <label htmlFor="duration">歌曲長度</label>
            <span className="value">{formatTime(duration)}</span>
          </div>
          <input
            id="duration"
            type="range"
            className="slider"
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={{ "--pct": `${((duration - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)) * 100}%` } as React.CSSProperties}
          />
          <div className="ticks">
            <span>0:30</span>
            <span>2:00</span>
            <span>4:00</span>
          </div>
        </div>

        <div className="field row wrap">
          <label className="label" htmlFor="lang">語言</label>
          <select
            id="lang"
            className="input select"
            value={language}
            disabled={instrumental}
            onChange={(e) => setLanguage(e.target.value as VocalLanguage)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          {mode === "easy" && (
            <Toggle checked={instrumental} onChange={setInstrumental} label="純音樂" />
          )}
        </div>

        <div className="field row wrap">
          <label className="label" htmlFor="reference">參考</label>
          <select
            id="reference"
            className="input select"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          >
            <option value="auto">自動（依描述挑選參考曲風）</option>
            <option value="none">不使用參考歌曲</option>
            {props.references.map((r) => (
              <option key={r.id} value={r.id}>
                參考：{r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field row">
          <span className="label">模式</span>
          <div className="segmented">
            <button
              type="button"
              className={quality === "fast" ? "seg active" : "seg"}
              onClick={() => setQuality("fast")}
            >
              標準・約 1 分鐘
            </button>
            <button
              type="button"
              className={quality === "best" ? "seg active" : "seg"}
              onClick={() => setQuality("best")}
            >
              精緻・先規劃再生成
            </button>
          </div>
        </div>

        {props.accessCodeRequired && (
          <div className="field">
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="通行碼"
              value={props.accessCode}
              onChange={(e) => props.onAccessCodeChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="create-foot">
        <button className="primary" type="submit" disabled={!canSubmit}>
          {props.submitting ? (
            <span className="spinner" aria-hidden />
          ) : mode === "easy" ? (
            <SparkIcon />
          ) : (
            <MusicIcon />
          )}
          {props.submitting ? "送出中…" : "生成歌曲"}
        </button>
        <p className="hint">
          {quality === "best"
            ? "精緻模式會先規劃整首歌的結構，約需 3–10 分鐘"
            : "通常會產生 2 個版本，約需 1–2 分鐘"}
        </p>
      </div>
    </form>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="track" aria-hidden>
        <span className="thumb" />
      </span>
      {props.label}
    </label>
  );
}
