#!/usr/bin/env node
import { TASK_STATUSES, transition } from "./acp.js";
import { runClaudeTask } from "./agents/claude.js";
import { getAgent, loadConfig } from "./config.js";
import { appendTaskEvent } from "./observability.js";
import { loadEnvelope, saveEnvelope } from "./state.js";

const taskId = process.argv[2];

try {
  if (!taskId) {
    throw new Error("Usage: worker.ts <task-id>");
  }

  const config = await loadConfig();
  const envelope = await loadEnvelope(config.stateDir, taskId);
  const agent = getAgent(config, envelope.agent);
  envelope.task.observer = {
    stateDir: config.stateDir,
    taskId
  };

  await appendTaskEvent(config.stateDir, taskId, "worker_started", {
    pid: process.pid,
    agent: envelope.agent
  });

  // heartbeat 让用户能判断长任务是否还活着，避免“派发后黑箱”等待。
  const heartbeat = setInterval(() => {
    appendTaskEvent(config.stateDir, taskId, "heartbeat", {
      pid: process.pid
    }).catch(() => {});
  }, 10000);

  try {
    await appendTaskEvent(config.stateDir, taskId, "agent_run_started", {
      agentType: agent.type
    });
    const result = await runClaudeTask(envelope.task, agent);
    envelope.result = result;
    transition(envelope, result.status, `Agent returned ${result.status}.`);
    await appendTaskEvent(config.stateDir, taskId, "agent_run_finished", {
      status: result.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const processInfo = typeof error === "object" && error && "process" in error
      ? (error as { process?: any }).process
      : undefined;
    envelope.result = {
      status: TASK_STATUSES.FAILED,
      summary: message,
      changed_files: [],
      tests: [],
      risks: [message],
      next_steps: [],
      raw: processInfo ?? {
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.stack ?? error.message : String(error)
      }
    };
    transition(envelope, TASK_STATUSES.FAILED, message);
    await appendTaskEvent(config.stateDir, taskId, "agent_run_failed", {
      message
    });
  } finally {
    clearInterval(heartbeat);
  }

  await saveEnvelope(config.stateDir, envelope);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}

