import type { PermissionMode, RoutingPolicy, RuntimeKind } from '../types/agentMesh'

export function displayRuntimeName(kind: RuntimeKind | string) {
  if (kind === 'claude-code') return 'Claude Code'
  if (kind === 'openclaw') return 'OpenClaw'
  if (kind === 'hermes') return 'Hermes'
  if (kind === 'codex') return 'Codex'
  return kind
}

export function displayChannelName(value?: string) {
  if (!value) return '未绑定'
  if (value.includes('feishu') || value === 'lark') return '飞书'
  if (value.includes('cli')) return 'CLI'
  if (value.includes('agent-mesh') || value.includes('chat')) return 'Agent Mesh Chat'
  return value
}

export function displayPermissionName(value?: string | PermissionMode) {
  if (!value) return '未配置'
  if (value.includes('readonly') || value === 'read-only') return '只读'
  if (value.includes('full') || value === 'full-access') return '完全访问'
  if (value.includes('safe') || value === 'safe-write') return '安全写入'
  return value
}

export function displayRoutingName(value?: string | RoutingPolicy['strategy']) {
  if (!value) return '未配置'
  if (value.includes('capability') || value === 'capability-match') return '能力匹配'
  if (value.includes('primary') || value === 'primary-first') return '主 Agent 优先'
  if (value.includes('round') || value === 'round-robin') return '轮询'
  if (value.includes('manual') || value === 'manual') return '手动选择'
  return value
}
