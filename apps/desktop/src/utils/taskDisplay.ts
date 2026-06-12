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
      parsed.permissionMode ? `permission=${parsed.permissionMode}` : '',
      parsed.changedFiles?.length ? `changed=${parsed.changedFiles.join(', ')}` : '',
      parsed.cwd ? `cwd=${parsed.cwd}` : '',
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
      changedFiles: Array.isArray(parsed.changed_files) ? parsed.changed_files.filter((item): item is string => typeof item === 'string') : undefined,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : undefined,
      permissionMode: typeof parsed.permission_mode === 'string' ? parsed.permission_mode : undefined,
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
  const result = asRecord(detail.result)
  const raw = getResultRaw(detail)
  const routingDecision = asRecord(detail.routingDecision)
  const delegation = asRecord(detail.delegation)
  const permissionDecision = asRecord(detail.permissionDecision)
  const writeCheck = summarizeWriteCheck(detail)

  return [
    ['routing', routingDecision ? compactObjectSummary(routingDecision, ['strategy', 'selected_member_title', 'selected_runtime_kind', 'reason']) : undefined],
    ['delegation', delegation ? compactObjectSummary(delegation, ['requester', 'assignee_title', 'assignee_runtime_kind', 'workspace_path']) : undefined],
    ['permission', permissionDecision ? compactObjectSummary(permissionDecision, ['mode', 'decision', 'write_detection_required']) : undefined],
    ['writeCheck', writeCheck],
    ['exitCode', raw?.exitCode],
    ['command', raw?.command],
    ['args', Array.isArray(raw?.args) ? raw.args.join(' ') : raw?.args],
    ['cwd', raw?.cwd],
    ['changedFiles', Array.isArray(result?.changed_files) ? result.changed_files.join(', ') || '[]' : result?.changed_files],
    ['writeViolations', Array.isArray(result?.write_violations) ? result.write_violations.join(', ') || '[]' : result?.write_violations],
    ['stderr', trimDiagnostic(raw?.stderr)],
    ['stdout', trimDiagnostic(raw?.stdout)],
  ]
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label: String(label), value: safeDisplayText(value, '内容不可读或过长，已隐藏') }))
}

export type PermissionOutcome = {
  title: string
  description: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  changedFiles: string[]
}

export function getPermissionOutcome(detail: Record<string, unknown> | null, logs: LogTail[]): PermissionOutcome {
  const result = asRecord(detail?.result)
  const permissionDecision = asRecord(detail?.permissionDecision)
  const mode = textValue(permissionDecision?.mode) ?? 'unknown'
  const changedFiles = [
    ...stringArray(result?.write_violations),
    ...stringArray(result?.changed_files),
    ...extractChangedFilesFromLogs(logs),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
  const uniqueChangedFiles = [...new Set(changedFiles)]
  const detectionStatus = textValue(result?.write_detection_status)
  const hasViolationEvent = logs.some((log) => log.lines.some((line) => line.includes('"write_policy_violation"')))
  const hasPassedEvent = logs.some((log) => log.lines.some((line) => line.includes('"permission_check_passed"')))
  const hasUnavailableEvent = logs.some((log) => log.lines.some((line) => line.includes('"permission_check_unavailable"')))

  if (hasViolationEvent || detectionStatus === 'violated' || uniqueChangedFiles.length > 0) {
    return {
      title: '写入检测：发现越权',
      description: `${mode} 任务检测到写入变化。`,
      tone: 'danger',
      changedFiles: uniqueChangedFiles,
    }
  }

  if (hasUnavailableEvent || detectionStatus === 'unavailable') {
    return {
      title: '写入检测：未能确认',
      description: `${mode} 任务未能完成 git status 前后校验，请查看日志。`,
      tone: 'warning',
      changedFiles: [],
    }
  }

  if (hasPassedEvent || detectionStatus === 'passed') {
    return {
      title: '写入检测：通过',
      description: `${mode} 任务未发现新增写入变化。`,
      tone: 'success',
      changedFiles: [],
    }
  }

  return {
    title: '写入检测：暂无结果',
    description: mode === 'read-only' ? 'read-only 任务尚未记录最终写入检测事件。' : `当前权限模式为 ${mode}。`,
    tone: 'neutral',
    changedFiles: [],
  }
}

function getResultRaw(detail: Record<string, unknown>) {
  const result = detail.result
  if (typeof result !== 'object' || result === null || !('raw' in result)) return null
  const raw = (result as { raw?: unknown }).raw
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null
}

function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function compactObjectSummary(record: Record<string, unknown>, keys: string[]) {
  return keys
    .map((key) => {
      const value = record[key]
      if (value === undefined || value === null || value === '') return ''
      return `${key}=${String(value)}`
    })
    .filter(Boolean)
    .join(' · ')
}

function trimDiagnostic(value: unknown) {
  if (typeof value !== 'string') return value
  const compact = value.trim()
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function extractChangedFilesFromLogs(logs: LogTail[]) {
  return logs.flatMap((log) => log.lines.flatMap((line) => {
    const parsed = tryParseJsonLine(line)
    return parsed?.changedFiles ?? []
  }))
}
