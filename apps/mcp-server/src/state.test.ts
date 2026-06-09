import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TASK_STATUSES, createEnvelope } from "./acp.js";
import { listEnvelopes, loadEnvelope, saveEnvelope, taskStatePath } from "./state.js";
import type { AcpTask, AgentConfig } from "./types.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), "agent-mesh-state-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

describe("state", () => {
  it("saves task envelopes using safe filenames", async () => {
    const task: AcpTask = {
      id: "task/unsafe",
      type: "task.assign",
      from: "test",
      to: "claude-code",
      role: "implementation_agent",
      objective: "测试状态持久化",
      workspace: { repo: "." },
      context: {},
      constraints: { may_edit: [], must_not_edit: [] },
      acceptance: ["状态可以再次读取"],
      expected_output: {}
    };
    const agent: AgentConfig = { name: "claude-code", type: "claude-cli" };
    const envelope = createEnvelope(task, agent);

    const file = await saveEnvelope(stateDir, envelope);
    const loaded = await loadEnvelope(stateDir, "task/unsafe");

    expect(file).toBe(taskStatePath(stateDir, "task/unsafe"));
    expect(loaded.status).toBe(TASK_STATUSES.CREATED);
  });

  it("lists task envelopes by newest first with optional status filter", async () => {
    const task: AcpTask = {
      id: "task_a",
      type: "task.assign",
      from: "test",
      to: "claude-code",
      role: "implementation_agent",
      objective: "测试任务列表",
      workspace: { repo: "." },
      context: {},
      constraints: { may_edit: [], must_not_edit: [] },
      acceptance: ["可以列出任务"],
      expected_output: {}
    };
    const agent: AgentConfig = { name: "claude-code", type: "claude-cli" };
    const envelope = createEnvelope(task, agent);
    envelope.status = TASK_STATUSES.COMPLETED;
    await saveEnvelope(stateDir, envelope);

    const listed = await listEnvelopes(stateDir, { status: TASK_STATUSES.COMPLETED });

    expect(listed).toHaveLength(1);
    expect(listed[0].envelope.id).toBe("task_a");
  });
});
