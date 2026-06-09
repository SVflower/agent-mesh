export type { Task, TaskStatus } from "@agent-mesh/schemas";

import type { TaskStatus } from "@agent-mesh/schemas";

const transitions: Record<TaskStatus, TaskStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["waiting", "completed", "failed", "cancelled", "stale"],
  waiting: ["running", "cancelled", "stale"],
  completed: [],
  failed: [],
  cancelled: [],
  stale: ["running", "failed", "cancelled"]
};

// 任务状态机用于统一 worker、MCP 查询和 UI 展示的状态流转规则。
export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

// 断言式 API 适合核心流程：一旦状态非法，调用方必须显式处理失败。
export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new Error(`非法任务状态流转: ${from} -> ${to}`);
  }
}
