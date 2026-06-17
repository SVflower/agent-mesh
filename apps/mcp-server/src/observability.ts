import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OfficeEvent } from "./types.js";
import { officeEventsPath } from "./state.js";
import { safeFileName } from "./state.js";

const OFFICE_EVENT_LIMIT = 1000;

export async function appendTaskEvent(
  stateDir: string,
  taskId: string,
  type: string,
  data: Record<string, unknown> = {}
): Promise<string> {
  const filePath = taskArtifactPath(stateDir, taskId, "events.jsonl");
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify({
    at: new Date().toISOString(),
    taskId,
    type,
    ...data
  })}\n`, "utf8");
  return filePath;
}

export async function appendTaskLog(
  stateDir: string,
  taskId: string,
  stream: "stdout" | "stderr",
  chunk: string
): Promise<string> {
  const filePath = taskArtifactPath(stateDir, taskId, `${stream}.log`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, chunk, "utf8");
  return filePath;
}

export async function readTaskEvents(stateDir: string, taskId: string, limit = 50) {
  const filePath = taskArtifactPath(stateDir, taskId, "events.jsonl");
  const content = await readFile(filePath, "utf8").catch(() => "");
  const events = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeJson(line))
    .filter(Boolean);

  return {
    taskId,
    events: events.slice(-limit),
    eventsFile: filePath
  };
}

export async function readTaskLogTail(
  stateDir: string,
  taskId: string,
  stream: "stdout" | "stderr" = "stdout",
  maxChars = 12000
) {
  const safeStream = stream === "stderr" ? "stderr" : "stdout";
  const filePath = taskArtifactPath(stateDir, taskId, `${safeStream}.log`);
  const content = await readFile(filePath, "utf8").catch(() => "");

  return {
    taskId,
    stream: safeStream,
    text: content.slice(-maxChars),
    logFile: filePath
  };
}

export async function appendOfficeEvent(
  stateDir: string,
  officeId: string,
  event: OfficeEvent
): Promise<string> {
  const filePath = officeEventsPath(stateDir, officeId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readFile(filePath, "utf8").catch(() => "");
  const lines = existing
    .split(/\r?\n/)
    .filter(Boolean);
  lines.push(JSON.stringify(event));
  const trimmed = lines.slice(-OFFICE_EVENT_LIMIT);
  await appendOfficeEventSnapshot(filePath, trimmed);
  return filePath;
}

export async function readOfficeEvents(stateDir: string, officeId: string, limit = 20) {
  const filePath = officeEventsPath(stateDir, officeId);
  const content = await readFile(filePath, "utf8").catch(() => "");
  const events = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeJson(line))
    .filter(Boolean) as OfficeEvent[];

  return {
    officeId,
    events: events.slice(-limit),
    eventsFile: filePath
  };
}

export function taskArtifactPath(stateDir: string, taskId: string, fileName: string): string {
  return path.resolve(stateDir, "tasks", safeFileName(taskId), fileName);
}

function safeJson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function appendOfficeEventSnapshot(filePath: string, lines: string[]): Promise<void> {
  const next = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  await writeFile(filePath, next, "utf8");
}
