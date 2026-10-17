// A small offline synthesizer: renders a SynthPlan (chords, melody, drum
// grooves written by Claude) to stereo PCM. No samples, no dependencies.
import type { SynthPlan, SynthSection } from "../composer.ts";

export const SR = 44100;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ music theory

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: [RegExp, number[]][] = [
  [/^(maj7|M7|Δ7?)/, [0, 4, 7, 11]],
  [/^m7b5/, [0, 3, 6, 10]],
  [/^(m7|min7|-7)/, [0, 3, 7, 10]],
  [/^(m6|min6)/, [0, 3, 7, 9]],
  [/^(m9|min9)/, [0, 3, 7, 10, 14]],
  [/^(dim7|°7)/, [0, 3, 6, 9]],
  [/^(dim|°)/, [0, 3, 6]],
  [/^(aug|\+)/, [0, 4, 8]],
  [/^sus2/, [0, 2, 7]],
  [/^(7sus4)/, [0, 5, 7, 10]],
  [/^sus4?/, [0, 5, 7]],
  [/^add9/, [0, 4, 7, 14]],
  [/^(m|min|-)/, [0, 3, 7]],
  [/^9/, [0, 4, 7, 10, 14]],
  [/^7/, [0, 4, 7, 10]],
  [/^6/, [0, 4, 7, 9]],
];

function pitchClass(name: string): number | null {
  const m = name.match(/^([A-G])([#♯b♭]?)/);
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
  return (PC[m[1]] + acc + 12) % 12;
}

interface Chord {
  root: number; // pitch class
  bass: number; // pitch class
  intervals: number[];
}

export function parseChord(symbol: string): Chord {
  const [main, slash] = symbol.trim().split("/");
  const root = pitchClass(main) ?? 0;
  const rest = main.replace(/^[A-G][#♯b♭]?/, "");
  const intervals = QUALITIES.find(([re]) => re.test(rest))?.[1] ?? [0, 4, 7];
  const bass = slash ? (pitchClass(slash) ?? root) : root;
  return { root, bass, intervals };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ------------------------------------------------------------ voices

type Buf = Float32Array;

function env(i: number, n: number, a: number, r: number): number {
  const att = Math.max(1, a * SR);
  const rel = Math.max(1, r * SR);
  if (i < att) return i / att;
  if (i > n - rel) return Math.max(0, (n - i) / rel);
  return 1;
}

function addLead(out: Buf, start: number, dur: number, midi: number, vel: number, kind: SynthPlan["lead"]) {
  const f = hz(midi);
  const s0 = Math.floor(start * SR);
  const tail = kind === "piano" || kind === "pluck" ? 0.25 : 0.08;
  const n = Math.floor((dur + tail) * SR);
  const end = Math.min(out.length, s0 + n);

  if (kind === "pluck") {
    // Karplus–Strong string.
    const period = Math.max(2, Math.round(SR / f));
    const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
    let idx = 0;
    for (let i = s0; i < end; i++) {
      const next = (idx + 1) % period;
      const v = ring[idx];
      ring[idx] = 0.497 * (ring[idx] + ring[next]);
      idx = next;
      out[i] += v * vel * 0.9 * env(i - s0, n, 0.002, 0.05);
    }
    return;
  }

  let phase = 0;
  let lp = 0;
  for (let i = s0; i < end; i++) {
    const t = (i - s0) / SR;
    const vib = 1 + (t > 0.25 ? 0.004 * Math.sin(TAU * 5.5 * t) : 0);
    phase += (f * vib) / SR;
    phase -= Math.floor(phase);
    let v: number;
    switch (kind) {
      case "brass": {
        const saw = 2 * phase - 1;
        const cutoff = 0.05 + 0.25 * Math.min(1, t / 0.06); // filter opens on attack
        lp += cutoff * (saw - lp);
        v = lp * 1.3;
        break;
      }
      case "square":
        v = (phase < 0.5 ? 1 : -1) * 0.5;
        break;
      case "saw": {
        const p2 = (phase * 1.006) % 1;
        v = (2 * phase - 1 + 2 * p2 - 1) * 0.35;
        lp += 0.35 * (v - lp);
        v = lp;
        break;
      }
      case "piano": {
        const d = Math.exp(-t * 2.2);
        v = (Math.sin(TAU * phase) + 0.45 * Math.sin(2 * TAU * phase) * Math.exp(-t * 4)
          + 0.2 * Math.sin(3 * TAU * phase) * Math.exp(-t * 6)) * d * 0.8;
        break;
      }
      default: // flute
        v = (Math.sin(TAU * phase) + 0.15 * Math.sin(2 * TAU * phase)) * 0.8
          + (Math.random() * 2 - 1) * 0.03;
    }
    const a = kind === "flute" || kind === "brass" ? 0.03 : 0.005;
    out[i] += v * vel * env(i - s0, n, a, tail);
  }
}

function addPad(out: Buf, start: number, dur: number, midis: number[], vel: number) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor((dur + 0.3) * SR);
  const end = Math.min(out.length, s0 + n);
  for (const midi of midis) {
    const f = hz(midi);
    const phases = [0, 0.33, 0.66];
    const detune = [1, 1.004, 0.996];
    let lp = 0;
    for (let i = s0; i < end; i++) {
      let v = 0;
      for (let k = 0; k < 3; k++) {
        phases[k] += (f * detune[k]) / SR;
        phases[k] -= Math.floor(phases[k]);
        v += 2 * phases[k] - 1;
      }
      lp += 0.06 * (v - lp);
      out[i] += (lp / 3) * vel * env(i - s0, n, 0.12, 0.3);
    }
  }
}

function addBass(out: Buf, start: number, dur: number, midi: number, vel: number) {
  const f = hz(midi);
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  const end = Math.min(out.length, s0 + n);
  let phase = 0;
  let lp = 0;
  for (let i = s0; i < end; i++) {
    phase += f / SR;
    phase -= Math.floor(phase);
    lp += 0.08 * (2 * phase - 1 - lp);
    const v = lp * 0.7 + Math.sin(TAU * phase) * 0.6;
    out[i] += v * vel * env(i - s0, n, 0.004, 0.03);
  }
}

type Drum = "kick" | "snare" | "hat" | "open" | "clap";

function addDrum(out: Buf, start: number, kind: Drum, vel: number) {
  const s0 = Math.floor(start * SR);
  const len = { kick: 0.35, snare: 0.22, hat: 0.05, open: 0.25, clap: 0.25 }[kind];
  const n = Math.floor(len * SR);
  const end = Math.min(out.length, s0 + n);
  let phase = 0;
  let hp = 0;
  let prev = 0;
  for (let i = s0; i < end; i++) {
    const t = (i - s0) / SR;
    let v = 0;
    const noise = Math.random() * 2 - 1;
    hp = 0.6 * (hp + noise - prev); // one-pole high-pass
    prev = noise;
    switch (kind) {
      case "kick": {
        const f = 45 + 110 * Math.exp(-t * 28);
        phase += f / SR;
        v = Math.sin(TAU * phase) * Math.exp(-t * 9) * 1.4;
        break;
      }
      case "snare":
        phase += 185 / SR;
        v = Math.sin(TAU * phase) * Math.exp(-t * 30) * 0.6 + hp * Math.exp(-t * 18) * 0.7;
        break;
      case "hat":
        v = hp * Math.exp(-t * 90) * 0.35;
        break;
      case "open":
        v = hp * Math.exp(-t * 14) * 0.25;
        break;
      case "clap": {
        const burst = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.3) : 1;
        v = hp * burst * Math.exp(-Math.max(0, t - 0.02) * 22) * 0.8;
        break;
      }
    }
    out[i] += v * vel;
  }
}

// Hits per bar as [beat, drum, velocity].
const GROOVES: Record<SynthSection["drums"], [number, Drum, number][]> = {
  rock: [
    [0, "kick", 1], [2, "kick", 0.9], [2.5, "kick", 0.7], [1, "snare", 1], [3, "snare", 1],
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b): [number, Drum, number] => [b, "hat", b % 1 ? 0.6 : 0.9]),
  ],
  march: [
    [0, "kick", 1], [2, "kick", 1], [1, "snare", 0.9], [3, "snare", 0.9],
    [1.75, "snare", 0.5], [3.5, "snare", 0.6], [3.75, "snare", 0.7],
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b): [number, Drum, number] => [b, "hat", 0.5]),
  ],
  dance: [
    [0, "kick", 1], [1, "kick", 1], [2, "kick", 1], [3, "kick", 1],
    [1, "clap", 0.9], [3, "clap", 0.9],
    [0.5, "open", 0.8], [1.5, "open", 0.8], [2.5, "open", 0.8], [3.5, "open", 0.8],
  ],
  halftime: [
    [0, "kick", 1], [1.5, "kick", 0.7], [2, "snare", 1],
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b): [number, Drum, number] => [b, "hat", 0.6]),
  ],
  cheer: [
    [0, "kick", 1], [0.5, "kick", 1], [1, "clap", 1],
    [2, "kick", 1], [2.5, "kick", 1], [3, "clap", 1],
  ],
  none: [],
};

// Bass rhythm per groove as [beat, length].
const BASS: Record<SynthSection["drums"], [number, number][]> = {
  rock: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => [b, 0.45]),
  march: [[0, 0.9], [1, 0.9], [2, 0.9], [3, 0.9]],
  dance: [0.5, 1.5, 2.5, 3.5].map((b) => [b, 0.4]),
  halftime: [[0, 1.4], [1.5, 0.45], [2, 1.9]],
  cheer: [[0, 0.4], [0.5, 0.4], [2, 0.4], [2.5, 0.4]],
  none: [[0, 3.9]],
};

// ------------------------------------------------------------ arrangement

function arrange(plan: SynthPlan, targetSec: number): SynthSection[] {
  const byName = new Map(plan.sections.map((s) => [s.name, s]));
  let form = plan.form.map((n) => byName.get(n)).filter((s): s is SynthSection => !!s);
  if (form.length === 0) form = plan.sections;
  const spb = 60 / plan.bpm;
  const len = (list: SynthSection[]) => list.reduce((t, s) => t + s.bars * 4 * spb, 0);

  const head = /intro/i.test(form[0].name) ? [form[0]] : [];
  const tail = form.length > 1 && /outro|ending|end/i.test(form[form.length - 1].name)
    ? [form[form.length - 1]]
    : [];
  const core = form.slice(head.length, form.length - tail.length);
  let body = [...core];
  // Repeat the core until it roughly fills the requested length.
  while (core.length && len([...head, ...body, ...tail]) < targetSec * 0.9 && body.length < 40) {
    body = [...body, ...core];
  }
  return [...head, ...body, ...tail];
}

function voiceChord(chord: Chord): number[] {
  // Keep the pad around middle C.
  let rootMidi = 48 + chord.root;
  if (rootMidi < 53) rootMidi += 12;
  return chord.intervals.slice(0, 4).map((iv) => rootMidi + iv);
}

/** Renders the plan to stereo PCM, trimmed/faded to roughly targetSec. */
export function renderSong(plan: SynthPlan, targetSec: number): [Buf, Buf] {
  const bpm = Math.min(180, Math.max(60, plan.bpm || 110));
  const spb = 60 / bpm;
  const sections = arrange({ ...plan, bpm }, targetSec);
  const total = sections.reduce((t, s) => t + s.bars * 4 * spb, 0);
  const length = Math.min(total, targetSec * 1.15) + 1.5;
  const n = Math.ceil(length * SR);

  const lead = new Float32Array(n);
  const pad = new Float32Array(n);
  const bass = new Float32Array(n);
  const drums = new Float32Array(n);

  let t0 = 0;
  for (const sec of sections) {
    const energy = sec.drums === "none" ? 0.6 : /chorus|hook|drop/i.test(sec.name) ? 1 : 0.8;
    const chords = sec.chords.length ? sec.chords : ["C"];
    for (let bar = 0; bar < sec.bars; bar++) {
      const barStart = t0 + bar * 4 * spb;
      if (barStart > length) break;
      const chord = parseChord(chords[bar % chords.length]);
      addPad(pad, barStart, 4 * spb, voiceChord(chord), 0.11 * energy);
      const bassMidi = 36 + chord.bass;
      for (const [b, l] of BASS[sec.drums] ?? BASS.none) {
        addBass(bass, barStart + b * spb, l * spb, bassMidi, 0.32 * energy);
      }
      for (const [b, d, v] of GROOVES[sec.drums] ?? []) {
        addDrum(drums, barStart + b * spb, d, v * 0.5 * energy);
      }
    }
    for (const note of sec.melody) {
      const [midi, beat, beats] = note;
      if (!(midi > 20 && midi < 110) || !(beat >= 0) || !(beats > 0)) continue;
      if (beat >= sec.bars * 4) continue;
      addLead(lead, t0 + beat * spb, Math.min(beats, 8) * spb, Math.round(midi), 0.3, plan.lead);
    }
    t0 += sec.bars * 4 * spb;
  }

  return mix({ lead, pad, bass, drums }, length);
}

// ------------------------------------------------------------ mixing

function reverb(input: Buf, seed: number): Buf {
  // Schroeder reverb: 4 parallel combs + 2 series all-passes.
  const out = new Float32Array(input.length);
  const combs = [1116, 1188, 1277, 1356].map((d) => d + seed);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < input.length; i++) {
      const y = buf[idx];
      lp = y * 0.8 + lp * 0.2;
      buf[idx] = input[i] + lp * 0.8;
      idx = (idx + 1) % d;
      out[i] += y * 0.25;
    }
  }
  for (const d of [556 + seed, 441 + seed]) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const b = buf[idx];
      const y = -out[i] + b;
      buf[idx] = out[i] + b * 0.5;
      idx = (idx + 1) % d;
      out[i] = y;
    }
  }
  return out;
}

function mix(t: { lead: Buf; pad: Buf; bass: Buf; drums: Buf }, length: number): [Buf, Buf] {
  const n = t.lead.length;
  const send = new Float32Array(n);
  for (let i = 0; i < n; i++) send[i] = t.lead[i] * 0.6 + t.pad[i] * 0.8 + t.drums[i] * 0.15;
  const revL = reverb(send, 0);
  const revR = reverb(send, 23);

  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const haas = Math.floor(0.012 * SR); // widen the pad
  for (let i = 0; i < n; i++) {
    const padR = i >= haas ? t.pad[i - haas] : 0;
    const dry = t.lead[i] + t.bass[i] + t.drums[i];
    L[i] = dry + t.pad[i] + revL[i] * 0.35;
    R[i] = dry + padR + revR[i] * 0.35;
  }

  // Normalize, soft-clip, fade out.
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 1.4 / peak;
  const fade = Math.floor(3 * SR);
  const end = Math.floor(length * SR);
  for (let i = 0; i < n; i++) {
    const f = i > end - fade ? Math.max(0, (end - i) / fade) : 1;
    L[i] = Math.tanh(L[i] * gain) * 0.89 * f;
    R[i] = Math.tanh(R[i] * gain) * 0.89 * f;
  }
  return [L, R];
}
