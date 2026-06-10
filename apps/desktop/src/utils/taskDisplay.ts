import type { LogTail, TaskSummary } from '../types/agentMesh'

const MOJIBAKE_PATTERN = /(?:\?{3,}|�|涓|鍚|鐨|鏄|鍔|瀹|绛|浠|犻|勫|佃|卞|傛|€)/

export function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function shortFileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}

export function shortPath(path: string) {
  const parts = path.split(/[\\/]/)
  return parts.slice(-2).join('\\')
}

export function safeDisplayText(value: unknown, fallback = '内容不可读') {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || MOJIBAKE_PATTERN.test(text)) return fallback
  return text
}

export function taskObjectiveLabel(task: TaskSummary) {
  return safeDisplayText(task.objective, inferObjectiveFromTaskId(task.id))
}

export function extractResultSummary(detail: Record<string, unknown> | null) {
  const result = detail?.result
  if (typeof result === 'object' && result !== null && 'summary' in result) {
    const summary = (result as { summary?: unknown }).summary
    return safeDisplayText(summary, '结果摘要包含不可读字符，请查看原始任务文件。')
  }
  return '暂未记录结果。'
}

export function formatLogLine(path: string, line: string) {
  const fileName = shortFileName(path)
  const parsed = tryParseJsonLine(line)
  if (parsed) {
    const message = [
      parsed.type,
      parsed.status,
      parsed.message,
      parsed.summary,
      parsed.taskId ? `task=${parsed.taskId}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return `${fileName} ${safeDisplayText(message, '结构化事件')}`
  }

  const readable = safeDisplayText(line, '该日志行包含不可读字符或编码异常')
  return `${fileName} ${readable.length > 220 ? `${readable.slice(0, 220)}...` : readable}`
}

export function getTaskHealth(task: TaskSummary, detail: Record<string, unknown> | null, logs: LogTail[]) {
  const lastActivityAt = getLastTaskActivity(task, detail, logs)
  const ageMs = lastActivityAt ? Date.now() - new Date(lastActivityAt).getTime() : Number.POSITIVE_INFINITY
  const stale = task.status === 'running' && ageMs > 120_000

  if (stale) {
    return {
      description: '运行中的任务超过 120 秒没有新事件或日志，建议检查进程是否仍在执行。',
      label: 'stale',
      lastActivityAt,
      title: '可能已停滞',
      tone: 'warning',
    }
  }

  if (task.status === 'running') {
    return {
      description: '最近仍有事件或日志，任务看起来还在执行。',
      label: 'active',
      lastActivityAt,
      title: '运行中',
      tone: 'success',
    }
  }

  if (task.status === 'failed') {
    return {
      description: '任务执行失败，请查看诊断、stderr 和命令信息。',
      label: 'failed',
      lastActivityAt,
      title: '执行失败',
      tone: 'danger',
    }
  }

  return {
    description: '任务当前没有检测到停滞风险。',
    label: task.status,
    lastActivityAt,
    title: '状态正常',
    tone: task.status === 'completed' ? 'success' : 'neutral',
  }
}

function inferObjectiveFromTaskId(taskId: string) {
  if (taskId.includes('smoke_readonly')) return '只读检查 README'
  if (taskId.includes('readonly')) return '只读项目检查'
  return '任务目标不可读'
}

function tryParseJsonLine(line: string) {
  const jsonStart = line.indexOf('{')
  if (jsonStart < 0) return null

  try {
    const parsed = JSON.parse(line.slice(jsonStart)) as Record<string, unknown>
    return {
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : undefined,
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
    }
  } catch {
    return null
  }
}

function getLastTaskActivity(task: TaskSummary, detail: Record<string, unknown> | null, logs: LogTail[]) {
  const eventTimes = Array.isArray(detail?.events)
    ? detail.events
      .map((event) => typeof event === 'object' && event !== null && 'at' in event ? (event as { at?: unknown }).at : undefined)
      .filter((value): value is string => typeof value === 'string')
    : []
  const newestLogTime = logs
    .map((log) => extractNewestIsoTimestamp(log.lines.join('\n')))
    .filter((value): value is string => Boolean(value))
  const candidates = [task.updated_at, ...eventTimes, ...newestLogTime]
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())

  return candidates[0] ?? task.updated_at ?? task.created_at
}

function extractNewestIsoTimestamp(text: string) {
  const matches = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g)
  return matches?.at(-1)
}

export function getTaskDiagnostics(detail: Record<string, unknown>) {
  const raw = getResultRaw(detail)
  if (!raw) return []

  return [
    ['exitCode', raw.exitCode],
    ['command', raw.command],
    ['args', Array.isArray(raw.args) ? raw.args.join(' ') : raw.args],
    ['cwd', raw.cwd],
    ['stderr', trimDiagnostic(raw.stderr)],
    ['stdout', trimDiagnostic(raw.stdout)],
  ]
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label: String(label), value: safeDisplayText(value, '内容不可读或过长，已隐藏') }))
}

function getResultRaw(detail: Record<string, unknown>) {
  const result = detail.result
  if (typeof result !== 'object' || result === null || !('raw' in result)) return null
  const raw = (result as { raw?: unknown }).raw
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null
}

function trimDiagnostic(value: unknown) {
  if (typeof value !== 'string') return value
  const compact = value.trim()
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact
}
