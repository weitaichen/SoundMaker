import { spawn } from "node:child_process";
import { config } from "./config.ts";

/**
 * Pipes audio through ffmpeg and returns a high-quality VBR MP3 (~245 kbps).
 * `inputArgs` describe stdin, e.g. ["-f", "wav"] or raw PCM format flags.
 */
export function toMp3(input: Buffer, inputArgs: string[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      config.ffmpegBin,
      ["-hide_banner", "-loglevel", "error", ...inputArgs, "-i", "pipe:0",
        "-codec:a", "libmp3lame", "-q:a", "0", "-f", "mp3", "pipe:1"],
      { windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => (err += d));
    ff.on("error", (e) => reject(new Error(`ffmpeg not found (${config.ffmpegBin}): ${e.message}`)));
    ff.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg failed: ${err}`)),
    );
    ff.stdin.on("error", () => {}); // ffmpeg may close stdin early on bad input
    ff.stdin.end(input);
  });
}
