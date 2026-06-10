import type { LogTail, RuntimeStatus, TaskSessionStatus, TaskSummary } from '../types/agentMesh'
import { extractResultSummary, shortFileName, taskObjectiveLabel } from './taskDisplay'

export type GraphNodeState = 'waiting' | 'executing' | 'done' | 'error' | 'standby'

export type DispatchGraphNode = {
  id: string
  label: string
  role: 'user' | 'captain' | 'worker' | 'result'
  state: GraphNodeState
  caption: string
}

export type DispatchGraphEdge = {
  id: string
  from: string
  to: string
  label: string
}

export type DispatchGraph = {
  nodes: DispatchGraphNode[]
  edges: DispatchGraphEdge[]
}

export function mapTaskState(status?: RuntimeStatus | string): GraphNodeState {
  if (status === 'queued' || status === 'assigned') return 'waiting'
  if (status === 'running') return 'executing'
  if (status === 'completed') return 'done'
  if (status === 'failed' || status === 'cancelled') return 'error'
  return 'standby'
}

export function deriveDispatchGraph(
  task?: TaskSummary,
  detail?: Record<string, unknown> | null,
  session?: TaskSessionStatus | null,
  logs: LogTail[] = [],
): DispatchGraph {
  if (!task) {
    return {
      nodes: [{
        id: 'empty',
        label: '等待任务分发',
        role: 'result',
        state: 'standby',
        caption: '选择左侧任务或发布新任务后，这里会显示主 Agent 与协作 Agent 的调度链路。',
      }],
      edges: [],
    }
  }

  const state = mapTaskState(session?.status ?? task.status)
  const workerName = displayAgentName(task.agent || session?.runtime_id || task.agent_type || 'agent')
  const toolLabels = extractToolLabels(detail, logs)
  const edgeLabel = toolLabels[0] ?? summarize(task.objective)
  const resultState = task.status === 'completed' ? 'done' : task.status === 'failed' || task.status === 'cancelled' ? 'error' : 'standby'

  return {
    nodes: [
      { id: 'user', label: '用户指令', role: 'user', state: 'done', caption: taskObjectiveLabel(task) },
      { id: 'captain', label: '主 Agent', role: 'captain', state: task.status === 'queued' ? 'waiting' : task.status === 'running' ? 'executing' : 'done', caption: '接收任务，选择路由策略，并汇总成员结果。' },
      { id: 'worker', label: workerName, role: 'worker', state, caption: toolLabels.length > 0 ? toolLabels.join(' / ') : (task.agent_type || '协作执行成员') },
      { id: 'result', label: '结果回传', role: 'result', state: resultState, caption: extractResultSummary(detail) },
    ],
    edges: [
      { id: 'edge-user-captain', from: 'user', to: 'captain', label: '解析 / 拆解' },
      { id: 'edge-captain-worker', from: 'captain', to: 'worker', label: edgeLabel },
      { id: 'edge-worker-result', from: 'worker', to: 'result', label: task.status === 'completed' ? '结果汇总' : '执行反馈' },
    ],
  }
}

export function formatTaskDuration(task?: TaskSummary) {
  if (!task?.created_at) return '--'
  const start = Date.parse(task.created_at)
  const end = Date.parse(task.completed_at ?? task.updated_at ?? new Date().toISOString())
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '--'
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function extractTaskUsage(detail?: Record<string, unknown> | null) {
  const usage = detail?.usage
  if (!usage || typeof usage !== 'object') return '--'
  const total = Object.values(usage as Record<string, unknown>)
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0)
  return total > 0 ? String(total) : '--'
}

export function compactLogLines(logs: LogTail[], limit = 24) {
  return logs
    .flatMap((log) => log.lines.map((line) => `${shortFileName(log.path)} ${line}`))
    .slice(-limit)
}

function extractToolLabels(detail?: Record<string, unknown> | null, logs: LogTail[] = []) {
  const labels = new Set<string>()
  const inspect = (value: unknown) => {
    if (!value || labels.size >= 4) return
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const name = record.name ?? record.tool ?? record.tool_name ?? record.command
      if (typeof name === 'string' && name.trim()) labels.add(name.trim())
      Object.values(record).forEach(inspect)
    }
  }
  inspect(detail?.tool_calls ?? detail?.events ?? detail?.steps ?? detail)
  logs.forEach((log) => {
    log.lines.forEach((line) => {
      const match = line.match(/\b(file_read|shell_exec|web_search|repo\.inspect|code\.review|summary\.write|dispatch|tool_call)\b/i)
      if (match) labels.add(match[1])
    })
  })
  return [...labels]
}

function summarize(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}...` : trimmed || '任务指令'
}

function displayAgentName(value: string) {
  if (value.includes('claude')) return 'Claude Code'
  if (value.includes('codex')) return 'Codex'
  if (value.includes('openclaw')) return 'OpenClaw'
  if (value.includes('hermes')) return 'Hermes'
  return value
}
