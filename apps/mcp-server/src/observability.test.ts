import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendTaskEvent, appendTaskLog, readTaskEvents, readTaskLogTail } from "./observability.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), "agent-mesh-observe-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

describe("observability", () => {
  it("persists task events and log tails", async () => {
    await appendTaskEvent(stateDir, "task/unsafe", "worker_started", { pid: 1 });
    await appendTaskLog(stateDir, "task/unsafe", "stdout", "hello\n");
    await appendTaskLog(stateDir, "task/unsafe", "stdout", "world\n");

    const events = await readTaskEvents(stateDir, "task/unsafe", 10);
    const tail = await readTaskLogTail(stateDir, "task/unsafe", "stdout", 6);

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ type: "worker_started", pid: 1 });
    expect(tail.text).toBe("world\n");
  });
});

