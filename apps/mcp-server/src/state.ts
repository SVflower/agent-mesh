import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OfficeTeamSnapshot, TaskEnvelope } from "./types.js";

export async function saveEnvelope(stateDir: string, envelope: TaskEnvelope): Promise<string> {
  const directory = path.resolve(stateDir, "tasks");
  await mkdir(directory, { recursive: true });

  const filePath = taskStatePath(stateDir, envelope.id);
  await writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return filePath;
}

export async function loadEnvelope(stateDir: string, taskId: string): Promise<TaskEnvelope> {
  const raw = await readFile(taskStatePath(stateDir, taskId), "utf8");
  return JSON.parse(raw) as TaskEnvelope;
}

export async function listEnvelopes(
  stateDir: string,
  options: {
    status?: string;
    limit?: number;
  } = {}
): Promise<Array<{ envelope: TaskEnvelope; stateFile: string; mtimeMs: number }>> {
  const directory = path.resolve(stateDir, "tasks");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name));

  const loaded = await Promise.all(files.map(async (file) => {
    const [raw, fileStat] = await Promise.all([
      readFile(file, "utf8"),
      stat(file)
    ]);
    return {
      envelope: JSON.parse(raw) as TaskEnvelope,
      stateFile: file,
      mtimeMs: fileStat.mtimeMs
    };
  }));

  return loaded
    .filter(({ envelope }) => !options.status || envelope.status === options.status)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, options.limit ?? 50);
}

export function taskStatePath(stateDir: string, taskId: string): string {
  return path.resolve(stateDir, "tasks", `${safeFileName(taskId)}.json`);
}

export function officeRuntimePath(stateDir: string, officeId: string): string {
  return path.resolve(stateDir, "offices", officeId);
}

export function officeTeamPath(stateDir: string, officeId: string): string {
  return path.resolve(officeRuntimePath(stateDir, officeId), "team.json");
}

export function officeContextPath(stateDir: string, officeId: string): string {
  return path.resolve(officeRuntimePath(stateDir, officeId), "context.json");
}

export function officeEventsPath(stateDir: string, officeId: string): string {
  return path.resolve(officeRuntimePath(stateDir, officeId), "events.jsonl");
}

export async function loadOfficeTeam(stateDir: string, officeId: string): Promise<OfficeTeamSnapshot | null> {
  const filePath = officeTeamPath(stateDir, officeId);
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as OfficeTeamSnapshot;
}

export async function saveOfficeTeam(stateDir: string, officeId: string, team: OfficeTeamSnapshot): Promise<string> {
  const filePath = officeTeamPath(stateDir, officeId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(team, null, 2)}\n`, "utf8");
  return filePath;
}

export async function loadOfficeContext(stateDir: string, officeId: string): Promise<Record<string, unknown> | null> {
  const filePath = officeContextPath(stateDir, officeId);
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

// task id 会来自外部 channel 或 agent，落盘前必须收敛成安全文件名。
export function safeFileName(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_");
}
