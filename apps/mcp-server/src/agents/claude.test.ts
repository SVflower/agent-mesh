import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskEvents, readTaskLogTail } from "../observability.js";
import type { AcpTask, AgentConfig } from "../types.js";
import { normalizeClaudeResult, runClaudeTask, sanitizeClaudeArgs } from "./claude.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), "agent-mesh-claude-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

describe("claude adapter", () => {
  it("removes prompt/session args because Agent Mesh sends prompt through stdin", () => {
    expect(sanitizeClaudeArgs([
      "-p",
      "--output-format",
      "json",
      "--resume",
      "abc",
      "--dangerously-skip-permissions"
    ])).toEqual(["--output-format", "json", "--dangerously-skip-permissions"]);
  });

  it("normalizes JSON result from Claude stdout", () => {
    const result = normalizeClaudeResult({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "completed",
        summary: "完成",
        changed_files: ["README.md"],
        tests: [],
        risks: [],
        next_steps: []
      }),
      stderr: "",
      command: "claude",
      args: [],
      cwd: "."
    });

    expect(result.status).toBe("completed");
    expect(result.changed_files).toEqual(["README.md"]);
  });

  it("streams observed stdout and stderr chunks before the process exits", async () => {
    const taskId = "async-progress";
    const task = createTask(taskId);
    const agent = createNodeAgent(`
      process.stdout.write("step one\\n");
      setTimeout(() => {
        process.stderr.write("warning one\\n");
        process.stdout.write(JSON.stringify({
          status: "completed",
          summary: "done",
          changed_files: [],
          tests: [],
          risks: [],
          next_steps: []
        }));
      }, 1000);
    `);

    let settled = false;
    const resultPromise = runClaudeTask(task, agent).finally(() => {
      settled = true;
    });

    await waitFor(async () => {
      const tail = await readTaskLogTail(stateDir, taskId, "stdout");
      return tail.text.includes("step one");
    });

    expect(settled).toBe(false);

    const eventsDuringRun = await readTaskEvents(stateDir, taskId, 20);
    expect(eventsDuringRun.events.some((event) => event?.type === "stdout_chunk")).toBe(true);

    const result = await resultPromise;
    const stdout = await readFile(path.join(stateDir, "tasks", taskId, "stdout.log"), "utf8");
    const stderrTail = await readTaskLogTail(stateDir, taskId, "stderr");
    const events = await readTaskEvents(stateDir, taskId, 20);

    expect(result.status).toBe("completed");
    expect(result.raw.stdout).toContain("step one");
    expect(stdout).toContain("step one");
    expect(stderrTail.text).toContain("warning one");
    expect(events.events.some((event) => event?.type === "stderr_chunk")).toBe(true);
  });
});

function createTask(taskId: string): AcpTask {
  return {
    id: taskId,
    type: "task.assign",
    from: "test",
    to: "claude-code",
    role: "implementation_agent",
    objective: "stream progress",
    workspace: {
      repo: process.cwd()
    },
    context: {},
    constraints: {
      may_edit: [],
      must_not_edit: []
    },
    acceptance: ["stream output"],
    expected_output: {
      format: "patch_with_summary"
    },
    observer: {
      stateDir,
      taskId
    }
  };
}

function createNodeAgent(script: string): AgentConfig {
  return {
    name: "node-test-agent",
    type: "claude-cli",
    command: process.execPath,
    args: ["-e", script],
    timeoutMs: 5000
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for predicate.");
}
