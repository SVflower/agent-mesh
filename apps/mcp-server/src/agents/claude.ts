import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { appendTaskEvent, appendTaskLog } from "../observability.js";
import { buildClaudePrompt } from "../prompt.js";
import type { AcpTask, AgentConfig, AgentResult } from "../types.js";

type ProcessOutput = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  command?: string;
  args?: string[];
  cwd?: string;
};

type Invocation = {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
};

type PendingObserverWrites = Set<Promise<void>>;

export async function runClaudeTask(task: AcpTask, agent: AgentConfig): Promise<AgentResult> {
  const timeoutMs = agent.timeoutMs ?? 900000;
  const output = await runProcess(await createClaudeInvocation(task, agent), {
    timeoutMs,
    observer: task.observer
  });
  await persistSessionFromOutput(task, agent, output);

  return normalizeClaudeResult(output);
}

export function normalizeClaudeResult(output: ProcessOutput): AgentResult {
  const parsed = tryParseJson(output.stdout);
  const text = extractClaudeText(parsed) ?? output.stdout.trim();
  const result = tryParseJson(text) ?? extractJsonObject(text) ?? {
    status: output.exitCode === 0 ? "completed" : "failed",
    summary: text || output.stderr.trim() || "Claude finished without text output.",
    changed_files: [],
    tests: [],
    risks: output.exitCode === 0 ? [] : [output.stderr.trim()].filter(Boolean),
    next_steps: []
  };

  if (output.exitCode !== 0 && result.status === "completed") {
    result.status = "failed";
  }

  return {
    status: normalizeStatus(result.status),
    summary: String(result.summary ?? ""),
    changed_files: Array.isArray(result.changed_files) ? result.changed_files : [],
    tests: Array.isArray(result.tests) ? result.tests : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
    raw: {
      exitCode: output.exitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      command: output.command,
      args: output.args,
      cwd: output.cwd
    }
  };
}

export async function getClaudeSession(task: Pick<AcpTask, "workspace">, agent: AgentConfig) {
  return loadSession(task, agent);
}

export async function clearClaudeSession(task: Pick<AcpTask, "workspace">, agent: AgentConfig) {
  const sessionFile = sessionPath(task, agent);
  await rm(sessionFile, { force: true });
  return {
    cleared: true,
    sessionFile
  };
}

async function createClaudeInvocation(task: AcpTask, agent: AgentConfig): Promise<Invocation> {
  const baseArgs = sanitizeClaudeArgs(agent.args ?? []);
  const sessionArgs = await buildSessionArgs(task, agent);
  const resolved = await resolveClaudeCommand(agent.command ?? "claude", [...baseArgs, ...sessionArgs]);

  return {
    command: resolved.command,
    args: resolved.args,
    cwd: path.resolve(task.workspace.repo),
    stdin: buildClaudePrompt(task)
  };
}

function runProcess(
  invocation: Invocation,
  options: {
    timeoutMs: number;
    observer?: AcpTask["observer"];
  }
): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    const pendingObserverWrites: PendingObserverWrites = new Set();

    const timer = setTimeout(() => {
      if (finished) return;
      child.kill();
      observe(options.observer, pendingObserverWrites, "process_timeout", {
        command: invocation.command,
        timeoutMs: options.timeoutMs
      });
      reject(createProcessError(
        `Command timed out after ${options.timeoutMs}ms: ${invocation.command}`,
        invocation,
        { stdout, stderr, exitCode: null }
      ));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      observeChunk(options.observer, pendingObserverWrites, "stdout", text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      observeChunk(options.observer, pendingObserverWrites, "stderr", text);
    });

    observe(options.observer, pendingObserverWrites, "prompt_sent", {
      bytes: Buffer.byteLength(invocation.stdin, "utf8")
    });
    child.stdin.end(invocation.stdin);

    child.on("error", (error) => {
      clearTimeout(timer);
      finished = true;
      observe(options.observer, pendingObserverWrites, "process_error", {
        message: error.message
      });
      flushObserverWrites(pendingObserverWrites).finally(() => reject(createProcessError(error.message, invocation, {
        stdout,
        stderr,
        exitCode: null,
        cause: error
      })));
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finished = true;
      observe(options.observer, pendingObserverWrites, "process_exit", { exitCode });
      flushObserverWrites(pendingObserverWrites).finally(() => resolve({
        exitCode,
        stdout,
        stderr,
        command: invocation.command,
        args: invocation.args,
        cwd: invocation.cwd
      }));
    });
  });
}

function observe(
  observer: AcpTask["observer"],
  pendingObserverWrites: PendingObserverWrites,
  type: string,
  data: Record<string, unknown> = {}
): void {
  if (!observer) return;
  trackObserverWrite(pendingObserverWrites, appendTaskEvent(observer.stateDir, observer.taskId, type, data));
}

function observeChunk(
  observer: AcpTask["observer"],
  pendingObserverWrites: PendingObserverWrites,
  stream: "stdout" | "stderr",
  text: string
): void {
  if (!observer) return;
  trackObserverWrite(pendingObserverWrites, appendTaskLog(observer.stateDir, observer.taskId, stream, text));
  trackObserverWrite(pendingObserverWrites, appendTaskEvent(observer.stateDir, observer.taskId, `${stream}_chunk`, {
    bytes: Buffer.byteLength(text, "utf8"),
    preview: text.trim().slice(0, 500)
  }));
}

function trackObserverWrite(pendingObserverWrites: PendingObserverWrites, write: Promise<unknown>): void {
  const safeWrite = write.catch(() => {}) as Promise<void>;
  pendingObserverWrites.add(safeWrite);
  safeWrite.finally(() => pendingObserverWrites.delete(safeWrite)).catch(() => {});
}

async function flushObserverWrites(pendingObserverWrites: PendingObserverWrites): Promise<void> {
  while (pendingObserverWrites.size > 0) {
    await Promise.all([...pendingObserverWrites]);
  }
}

// Windows 上 Node.js spawn 不一定能直接找到 claude.cmd，所以需要显式包装 cmd /d /c call。
async function resolveClaudeCommand(command: string, args: string[]): Promise<{ command: string; args: string[] }> {
  if (process.platform !== "win32") {
    return { command, args };
  }

  if (command.toLowerCase() === "cmd") {
    return { command, args };
  }

  const executable = await findWindowsExecutable(command);
  if (!executable || !executable.toLowerCase().endsWith(".cmd")) {
    return {
      command: executable ?? command,
      args
    };
  }

  return {
    command: "cmd",
    args: ["/d", "/c", "call", executable, ...args]
  };
}

async function findWindowsExecutable(command: string): Promise<string | null> {
  if (path.extname(command)) {
    return await exists(command) ? command : null;
  }

  const pathValue = process.env.PATH ?? "";
  const candidates = pathValue
    .split(path.delimiter)
    .flatMap((directory) => [
      path.join(directory, `${command}.cmd`),
      path.join(directory, `${command}.exe`),
      path.join(directory, command)
    ]);

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Claude Code 的 prompt 统一走 stdin，避免 -p 把后续 CLI 参数误吃成 prompt。
export function sanitizeClaudeArgs(args: string[]): string[] {
  const blocked = new Set(["-p", "--print", "--resume", "-r", "--continue", "-c", "--session-id"]);
  const sanitized: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!blocked.has(arg)) {
      sanitized.push(arg);
      continue;
    }

    if (arg !== "-p" && arg !== "--print" && index + 1 < args.length) {
      index += 1;
    }
  }

  return sanitized;
}

async function buildSessionArgs(task: AcpTask, agent: AgentConfig): Promise<string[]> {
  if (agent.sessionMode !== "resume") {
    return [];
  }

  const session = await loadSession(task, agent);
  return session?.sessionId ? ["--resume", session.sessionId] : [];
}

async function persistSessionFromOutput(task: AcpTask, agent: AgentConfig, output: ProcessOutput): Promise<void> {
  if (agent.sessionMode !== "resume") {
    return;
  }

  const parsed = tryParseJson(output.stdout);
  const sessionId = parsed?.session_id ?? parsed?.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return;
  }

  const sessionFile = sessionPath(task, agent);
  await mkdir(path.dirname(sessionFile), { recursive: true });
  await writeFile(sessionFile, `${JSON.stringify({
    sessionId,
    repo: path.resolve(task.workspace.repo),
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

async function loadSession(task: Pick<AcpTask, "workspace">, agent: AgentConfig): Promise<{ sessionId: string; repo: string; updatedAt: string } | null> {
  try {
    return JSON.parse(await readFile(sessionPath(task, agent), "utf8")) as {
      sessionId: string;
      repo: string;
      updatedAt: string;
    };
  } catch {
    return null;
  }
}

function sessionPath(task: Pick<AcpTask, "workspace">, agent: AgentConfig): string {
  const repoKey = path.resolve(task.workspace.repo).replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.resolve(agent.sessionDir ?? ".agent-mesh/sessions", `${repoKey}.json`);
}

function createProcessError(
  message: string,
  invocation: Invocation,
  details: {
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    cause?: unknown;
  } = {}
): Error & { process?: ProcessOutput } {
  const error = new Error(message) as Error & { process?: ProcessOutput; cause?: unknown };
  error.process = {
    command: invocation.command,
    args: invocation.args,
    cwd: invocation.cwd,
    stdout: details.stdout ?? "",
    stderr: details.stderr ?? "",
    exitCode: details.exitCode ?? null
  };
  if (details.cause) {
    error.cause = details.cause;
  }
  return error;
}

function tryParseJson(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value) as Record<string, any>;
  } catch {
    return null;
  }
}

function extractClaudeText(parsed: Record<string, any> | null): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.result === "string") return parsed.result.trim();
  if (typeof parsed.content === "string") return parsed.content.trim();
  if (typeof parsed.text === "string") return parsed.text.trim();
  return null;
}

function extractJsonObject(text: string): Record<string, any> | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1].trim())
    .reverse();

  for (const candidate of fenced) {
    const parsed = tryParseJson(candidate);
    if (parsed) return parsed;
  }

  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParseJson(text.slice(start, end + 1));
  }

  return null;
}

function normalizeStatus(status: unknown): "completed" | "failed" | "blocked" {
  if (status === "completed" || status === "failed" || status === "blocked") return status;
  return "failed";
}
