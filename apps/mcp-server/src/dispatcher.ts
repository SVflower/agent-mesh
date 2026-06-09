import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TASK_STATUSES, createEnvelope, transition, validateTask } from "./acp.js";
import { clearClaudeSession, getClaudeSession, runClaudeTask } from "./agents/claude.js";
import { loadConfig, getAgent } from "./config.js";
import { appendTaskEvent } from "./observability.js";
import { readTaskEvents, readTaskLogTail } from "./observability.js";
import { listEnvelopes, loadEnvelope, saveEnvelope, taskStatePath } from "./state.js";
import type { AcpTask, AgentConfig, AgentResult, DispatchInput, TaskEnvelope } from "./types.js";

export async function dispatchTask(input: DispatchInput) {
  const task = createTaskFromInput(input);
  const { config, agent, envelope } = await prepareDispatch(task, input.agent);

  try {
    if (agent.type !== "claude-cli") {
      throw new Error(`Unsupported agent type: ${agent.type}`);
    }

    const result = await runClaudeTask(task, agent);
    envelope.result = result;
    transition(envelope, result.status, `Agent returned ${result.status}.`);
  } catch (error) {
    envelope.result = failureResult(error);
    transition(envelope, TASK_STATUSES.FAILED, errorMessage(error));
  }

  const stateFile = await saveEnvelope(config.stateDir, envelope);
  return summarizeEnvelope(envelope, stateFile);
}

export async function dispatchTaskAsync(input: DispatchInput) {
  const task = createTaskFromInput(input);
  const { config, agent, envelope } = await prepareDispatch(task, input.agent);
  const stateFile = await saveEnvelope(config.stateDir, envelope);

  try {
    if (agent.type !== "claude-cli") {
      throw new Error(`Unsupported agent type: ${agent.type}`);
    }

    const child = startWorker(task.id);
    transition(envelope, TASK_STATUSES.RUNNING, "Agent worker started in background.", {
      pid: child.pid
    });
    await saveEnvelope(config.stateDir, envelope);

    return {
      id: envelope.id,
      status: envelope.status,
      stateFile,
      pid: child.pid,
      message: "Task dispatched asynchronously. Use get_agent_task_status to poll for completion."
    };
  } catch (error) {
    envelope.result = failureResult(error);
    transition(envelope, TASK_STATUSES.FAILED, errorMessage(error));
    const failedStateFile = await saveEnvelope(config.stateDir, envelope);
    return summarizeEnvelope(envelope, failedStateFile);
  }
}

export async function getTaskStatus(taskId: string) {
  const config = await loadConfig();
  const envelope = await loadEnvelope(config.stateDir, taskId);
  return summarizeEnvelope(envelope, taskStatePath(config.stateDir, taskId));
}

export async function listTasks(options: { status?: string; limit?: number } = {}) {
  const config = await loadConfig();
  const tasks = await listEnvelopes(config.stateDir, options);

  return {
    count: tasks.length,
    tasks: tasks.map(({ envelope, stateFile }) => ({
      id: envelope.id,
      status: envelope.status,
      agent: envelope.agent,
      agentType: envelope.agentType,
      objective: envelope.task.objective,
      repo: envelope.task.workspace.repo,
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
      summary: envelope.result?.summary ?? "",
      stateFile
    }))
  };
}

export async function cancelTask(taskId: string) {
  const config = await loadConfig();
  const envelope = await loadEnvelope(config.stateDir, taskId);

  if (["completed", "failed", "blocked", "cancelled"].includes(envelope.status)) {
    return {
      id: envelope.id,
      status: envelope.status,
      cancelled: false,
      message: `Task is already terminal: ${envelope.status}.`
    };
  }

  const pid = findWorkerPid(envelope);
  let killed = false;
  let killError: string | null = null;

  if (typeof pid === "number") {
    try {
      process.kill(pid);
      killed = true;
    } catch (error) {
      killError = errorMessage(error);
    }
  }

  transition(envelope, TASK_STATUSES.CANCELLED, "Task cancelled by user.", {
    pid,
    killed,
    killError
  });
  await appendTaskEvent(config.stateDir, taskId, "task_cancelled", {
    pid,
    killed,
    killError
  });
  const stateFile = await saveEnvelope(config.stateDir, envelope);

  return {
    id: envelope.id,
    status: envelope.status,
    cancelled: true,
    killed,
    pid,
    killError,
    stateFile
  };
}

export async function getTaskEvents(taskId: string, limit = 50) {
  const config = await loadConfig();
  return readTaskEvents(config.stateDir, taskId, limit);
}

export async function getTaskLogTail(taskId: string, stream: "stdout" | "stderr" = "stdout", maxChars = 12000) {
  const config = await loadConfig();
  return readTaskLogTail(config.stateDir, taskId, stream, maxChars);
}

export async function getSessionStatus(repo = ".") {
  const config = await loadConfig();
  const agent = getAgent(config, config.defaultAgent);
  const task = {
    workspace: {
      repo: path.resolve(process.cwd(), repo)
    }
  };
  const session = await getClaudeSession(task, agent);
  return {
    agent: agent.name,
    repo: task.workspace.repo,
    sessionMode: agent.sessionMode ?? "none",
    session
  };
}

export async function resetSession(repo = ".") {
  const config = await loadConfig();
  const agent = getAgent(config, config.defaultAgent);
  const task = {
    workspace: {
      repo: path.resolve(process.cwd(), repo)
    }
  };
  return clearClaudeSession(task, agent);
}

export async function getNodeStatus(nodeId?: string) {
  const config = await loadConfig();
  const tasks = await listEnvelopes(config.stateDir, { limit: 200 });
  const agentEntries = Object.entries(config.agents)
    .filter(([id]) => !nodeId || id === nodeId);

  if (nodeId && agentEntries.length === 0) {
    throw new Error(`Unknown node "${nodeId}".`);
  }

  return {
    count: agentEntries.length,
    nodes: agentEntries.map(([id, agent]) => {
      const nodeTasks = tasks.filter(({ envelope }) => envelope.agent === id);
      const running = nodeTasks.filter(({ envelope }) => envelope.status === "running").length;
      const failed = nodeTasks.filter(({ envelope }) => envelope.status === "failed").length;
      const stale = nodeTasks.filter(({ envelope }) => isTaskStale(envelope)).length;
      const latestTask = nodeTasks[0]?.envelope;

      return {
        id,
        name: id,
        type: agent.type,
        description: agent.description ?? "",
        capabilities: agent.capabilities ?? [],
        health: stale > 0 ? "degraded" : "online",
        runningTasks: running,
        failedTasks: failed,
        staleTasks: stale,
        latestTaskId: latestTask?.id,
        latestTaskUpdatedAt: latestTask?.updatedAt
      };
    })
  };
}

export async function getOfficeStatus(officeId?: string) {
  const config = await loadConfig();
  const nodeStatus = await getNodeStatus();
  const nodeMap = new Map(nodeStatus.nodes.map((node) => [node.id, node]));
  const officeEntries = Object.entries(config.offices)
    .filter(([id]) => !officeId || id === officeId);

  if (officeId && officeEntries.length === 0) {
    throw new Error(`Unknown office "${officeId}".`);
  }

  return {
    count: officeEntries.length,
    offices: officeEntries.map(([id, office]) => {
      const nodeIds = [office.primaryNodeId, ...(office.secondaryNodeIds ?? [])];
      const nodes = nodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
      const degradedNodes = nodes.filter((node) => node?.health === "degraded").length;
      const runningTasks = nodes.reduce((sum, node) => sum + (node?.runningTasks ?? 0), 0);
      const failedTasks = nodes.reduce((sum, node) => sum + (node?.failedTasks ?? 0), 0);
      const staleTasks = nodes.reduce((sum, node) => sum + (node?.staleTasks ?? 0), 0);

      return {
        id,
        name: office.name,
        health: degradedNodes > 0 || staleTasks > 0 ? "degraded" : "online",
        primaryNodeId: office.primaryNodeId,
        secondaryNodeIds: office.secondaryNodeIds ?? [],
        channelIds: office.channelIds ?? [],
        projectIds: office.projectIds ?? [],
        defaultRoutingPolicyId: office.defaultRoutingPolicyId,
        defaultPermissionPolicyId: office.defaultPermissionPolicyId,
        runningTasks,
        failedTasks,
        staleTasks
      };
    })
  };
}

function createTaskFromInput(input: DispatchInput): AcpTask {
  return {
    id: input.id,
    type: "task.assign",
    from: "agent-mesh-requester",
    to: input.agent ?? "claude-code",
    role: "implementation_agent",
    objective: input.objective,
    workspace: {
      repo: input.repo ?? "."
    },
    context: input.context ?? {},
    constraints: {
      may_edit: input.constraints?.may_edit ?? [],
      must_not_edit: input.constraints?.must_not_edit ?? []
    },
    acceptance: input.acceptance,
    expected_output: input.expected_output ?? {
      format: "patch_with_summary",
      include_tests: true
    }
  };
}

async function prepareDispatch(task: AcpTask, agentName?: string): Promise<{
  config: Awaited<ReturnType<typeof loadConfig>>;
  agent: AgentConfig;
  envelope: TaskEnvelope;
}> {
  const config = await loadConfig();
  const agent = getAgent(config, agentName ?? task.to);
  task.to = agent.name;
  task.workspace.repo = path.resolve(process.cwd(), task.workspace.repo);

  const validationErrors = validateTask(task);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid task:\n- ${validationErrors.join("\n- ")}`);
  }

  const envelope = createEnvelope(task, agent);
  transition(envelope, TASK_STATUSES.ASSIGNED, `Assigned to ${agent.name}.`);
  transition(envelope, TASK_STATUSES.RUNNING, `Running ${agent.type}.`);
  await saveEnvelope(config.stateDir, envelope);

  return { config, agent, envelope };
}

function startWorker(taskId: string) {
  const currentFile = fileURLToPath(import.meta.url);
  const isTypeScriptRuntime = currentFile.endsWith(".ts");
  const workerPath = path.resolve(
    path.dirname(currentFile),
    isTypeScriptRuntime ? "worker.ts" : "worker.js"
  );
  const workerArgs = isTypeScriptRuntime
    ? ["--import", "tsx", workerPath, taskId]
    : [workerPath, taskId];

  const child = spawn(process.execPath, workerArgs, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });

  child.unref();
  return child;
}

function failureResult(error: unknown): AgentResult {
  const processInfo = typeof error === "object" && error && "process" in error
    ? (error as { process?: AgentResult["raw"] }).process
    : undefined;
  return {
    status: TASK_STATUSES.FAILED,
    summary: errorMessage(error),
    changed_files: [],
    tests: [],
    risks: [errorMessage(error)],
    next_steps: [],
    raw: processInfo ?? {
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.stack ?? error.message : String(error)
    }
  };
}

function summarizeEnvelope(envelope: TaskEnvelope, stateFile: string) {
  return {
    id: envelope.id,
    status: envelope.status,
    result: envelope.result,
    stateFile,
    updatedAt: envelope.updatedAt,
    events: envelope.events
  };
}

function findWorkerPid(envelope: TaskEnvelope): number | undefined {
  const event = [...envelope.events].reverse().find((candidate) => typeof candidate.pid === "number");
  return typeof event?.pid === "number" ? event.pid : undefined;
}

function isTaskStale(envelope: TaskEnvelope): boolean {
  if (envelope.status !== "running") return false;
  const lastUpdate = Date.parse(envelope.updatedAt);
  if (Number.isNaN(lastUpdate)) return false;
  return Date.now() - lastUpdate > 5 * 60 * 1000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
