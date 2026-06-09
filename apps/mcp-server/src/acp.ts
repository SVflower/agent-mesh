import type { AcpTask, AgentConfig, TaskEnvelope, TaskStatus } from "./types.js";

export const TASK_STATUSES = {
  CREATED: "created",
  ASSIGNED: "assigned",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
  CANCELLED: "cancelled"
} as const;

// 这里校验的是 Agent Mesh 派发给具体 Agent 的任务包，避免 worker 启动后才发现任务边界不完整。
export function validateTask(task: AcpTask): string[] {
  const errors: string[] = [];

  requireString(task, "id", errors);
  requireString(task, "type", errors);
  requireString(task, "from", errors);
  requireString(task, "to", errors);
  requireString(task, "objective", errors);

  if (task.type !== "task.assign") {
    errors.push("type must be task.assign.");
  }

  if (!task.workspace || typeof task.workspace !== "object") {
    errors.push("workspace must be an object.");
  } else {
    requireString(task.workspace, "repo", errors, "workspace.repo");
  }

  if (!Array.isArray(task.acceptance) || task.acceptance.length === 0) {
    errors.push("acceptance must be a non-empty array.");
  }

  return errors;
}

// Envelope 是持久化状态的核心对象，MCP 查询、UI 和日志都围绕它展开。
export function createEnvelope(task: AcpTask, agent: AgentConfig): TaskEnvelope {
  const now = new Date().toISOString();

  return {
    id: task.id,
    type: task.type,
    status: TASK_STATUSES.CREATED,
    createdAt: now,
    updatedAt: now,
    agent: task.to,
    agentType: agent.type,
    task,
    events: [
      {
        at: now,
        status: TASK_STATUSES.CREATED,
        message: "Task accepted by Agent Mesh."
      }
    ],
    result: null
  };
}

// 状态变化同时写入 envelope.events，保证即使没有打开 JSONL 日志也能看见关键生命周期。
export function transition(
  envelope: TaskEnvelope,
  status: TaskStatus,
  message: string,
  data: Record<string, unknown> = {}
): TaskEnvelope {
  const now = new Date().toISOString();
  envelope.status = status;
  envelope.updatedAt = now;
  envelope.events.push({
    at: now,
    status,
    message,
    ...data
  });
  return envelope;
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  errors: string[],
  label = key
): void {
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    errors.push(`${label} must be a non-empty string.`);
  }
}
