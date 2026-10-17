// Runs Claude Code headless (`claude -p`) with the subscription it is logged in
// with. Song requests come from the public website, so Claude gets NO tools,
// no MCP servers, and no user customizations: it can only return text.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config.ts";

const workDir = join(tmpdir(), "aimusic-claude");
mkdirSync(workDir, { recursive: true });

/** An error with a separate, visitor-friendly message for the website. */
export class PublicError extends Error {
  publicMessage: string;
  constructor(publicMessage: string, detail: string) {
    super(detail);
    this.publicMessage = publicMessage;
  }
}

interface ClaudeResult {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

/** Strips variables a parent Claude Code session sets, so the child uses its own login. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const nested = Boolean(env.CLAUDECODE);
  for (const key of Object.keys(env)) {
    const sessionScoped =
      key === "CLAUDECODE" ||
      key === "CLAUDE_PID" ||
      key.startsWith("CLAUDE_AGENT_SDK") ||
      (key.startsWith("CLAUDE_CODE_") && key !== "CLAUDE_CODE_OAUTH_TOKEN");
    if (sessionScoped) delete env[key];
  }
  if (nested) delete env.ANTHROPIC_BASE_URL;
  // Empty values from .env would otherwise shadow the CLI's own login.
  for (const key of ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]) {
    if (!env[key]) delete env[key];
  }
  return env;
}

function run(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeBin, args, {
      cwd: workDir,
      env: childEnv(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude timed out after ${config.claudeTimeoutMs / 1000}s`));
    }, config.claudeTimeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Claude Code (${config.claudeBin}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // With --output-format json, errors still arrive as a JSON result on stdout.
      if (code === 0 || out.trim().startsWith("{")) resolve(out);
      else reject(new Error(`Claude exited with ${code}: ${(err || out).slice(0, 500)}`));
    });
    child.stdin.end(stdin, "utf8");
  });
}

export async function askClaude<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
}): Promise<T> {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(opts.schema),
    "--system-prompt", opts.system,
    "--tools", "",
    "--strict-mcp-config",
    "--safe-mode",
    "--no-session-persistence",
  ];
  if (config.claudeModel) args.push("--model", config.claudeModel);

  const stdout = await run(args, opts.prompt);

  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Unexpected Claude output: ${stdout.slice(0, 300)}`);
  }
  if (parsed.is_error) {
    const msg = String(parsed.result ?? "");
    if (/authenticat|log ?in|OAuth/i.test(msg)) {
      throw new PublicError(
        "生成服務的 Claude 目前未登入，請稍後再試或通知網站管理員。",
        `Claude 未登入：${msg} → 請在這台電腦執行 claude setup-token，把 token 填進 worker/.env 的 CLAUDE_CODE_OAUTH_TOKEN（見 README）`,
      );
    }
    throw new Error(`Claude error: ${msg.slice(0, 300)}`);
  }
  if (parsed.structured_output) return parsed.structured_output as T;
  // Fallback: pull the first JSON object out of the text result.
  const match = (parsed.result ?? "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude did not return a song plan.");
  return JSON.parse(match[0]) as T;
}
