// Local style-reference library (like Mureka's "Reference"): songs in
// worker/references/ that ACE-Step uses as a ~30 s style/timbre guide.
// Add a song: drop a wav/mp3 in the folder and add an entry to references.json.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JobInput } from "./types.ts";

interface ReferenceEntry {
  id: string;
  name: string;
  file: string;
  keywords?: string[];
}

const DIR = join(import.meta.dirname, "..", "references");

function load(): ReferenceEntry[] {
  try {
    const list = JSON.parse(readFileSync(join(DIR, "references.json"), "utf8")) as ReferenceEntry[];
    return list.filter((r) => r.id && r.name && existsSync(join(DIR, r.file)));
  } catch {
    return [];
  }
}

/** Re-read on every call so edits to the folder apply without restarting. */
export function listReferences(): { id: string; name: string }[] {
  return load().map(({ id, name }) => ({ id, name }));
}

/** Picks the reference file for a job: explicit id, keyword match for "auto", or none. */
export function resolveReference(input: JobInput): { path: string; name: string } | undefined {
  const choice = input.reference ?? "auto";
  if (choice === "none") return undefined;
  const refs = load();
  let pick: ReferenceEntry | undefined;
  if (choice === "auto") {
    const text = `${input.title} ${input.prompt} ${input.lyrics}`.toLowerCase();
    let best = 0;
    for (const r of refs) {
      const hits = (r.keywords ?? []).filter((k) => text.includes(k.toLowerCase())).length;
      if (hits > best) {
        best = hits;
        pick = r;
      }
    }
  } else {
    pick = refs.find((r) => r.id === choice);
  }
  return pick ? { path: join(DIR, pick.file), name: pick.name } : undefined;
}
