import { invoke } from '@tauri-apps/api/core'
import type {
  AgentMeshConfig,
  CreateChatTaskPayload,
  LocalAgentInventoryItem,
  LogTail,
  Office,
  Persona,
  RuntimeAdapterStatus,
  RuntimeDetectionResponse,
  SaveOfficePayload,
  TaskSessionStatus,
  TaskSummary,
} from '../types/agentMesh'

const devBrowserMockEnabled = import.meta.env.DEV && typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)

const smokeTaskId = 'chat_1781256290342'
const smokeTaskDetail: Record<string, unknown> = {
  id: smokeTaskId,
  status: 'completed',
  agent: 'claude-code',
  agentType: 'claude-cli',
  office_id: 'office_test_1781072362758',
  assigned_member_id: 'office_test_1781072362758_member_1',
  createdAt: '1781256290342',
  updatedAt: '1781256431820',
  completedAt: '1781256431820',
  routingDecision: {
    routing_policy_name: 'test 只读检查路由',
    strategy: 'capability-match',
    selected_member_title: '协作 Agent',
    selected_runtime_kind: 'claude-code',
    reason: "Routing policy 'test 只读检查路由' used strategy 'capability-match' and selected member '协作 Agent' for task type '只读项目检查'.",
  },
  delegation: {
    requester: 'agent-mesh-chat',
    assignee_title: '协作 Agent',
    assignee_responsibility: 'Claude Code 默认 CLI 身份，适合实现、审查和仓库分析。',
    assignee_runtime_kind: 'claude-code',
    workspace_path: 'D:\\IDEA\\workspace\\agent-mesh',
  },
  permissionDecision: {
    mode: 'read-only',
    decision: 'allow_read_only',
    write_detection_required: true,
  },
  task: {
    objective: '只读检查 agent-mesh 项目是做什么的，说明核心模块、当前能力边界和下一步最该验证的闭环。不得修改任何文件。',
    workspace: { repo: 'D:\\IDEA\\workspace\\agent-mesh' },
  },
  result: {
    status: 'completed',
    summary: 'Agent Mesh 是跨产品本地 AI Agent 团队的协作控制平面。它将 Hermes、Claude Code、Codex、OpenClaw 等独立 Agent 产品组织成可视化的办公室团队，并已通过 read-only 真实闭环验证。',
    changed_files: [],
    write_violations: null,
    raw: {
      command: 'D:\\Node\\claude.cmd',
      args: ['--output-format', 'json'],
      cwd: 'D:\\IDEA\\workspace\\agent-mesh',
      exitCode: 0,
      stderr: '',
      stdout: '{"status":"completed"}',
    },
  },
}

const smokeTaskSummary: TaskSummary = {
  id: smokeTaskId,
  status: 'completed',
  objective: String((smokeTaskDetail.task as { objective: string }).objective),
  agent: 'claude-code',
  agent_type: 'claude-cli',
  workspace_path: 'D:\\IDEA\\workspace\\agent-mesh',
  created_at: '1781256290342',
  updated_at: '1781256431820',
  completed_at: '1781256431820',
}

const smokeOffice = {
  id: 'office_test_1781072362758',
  name: 'test',
  description: '只读真实闭环验证办公室',
  default_permission_policy_id: 'policy_local_readonly',
  default_task_type_id: 'task_type_office_test_1781072362758_readonly_repo_inspect',
  default_routing_policy_id: 'routing_office_test_1781072362758_readonly_repo_inspect',
  default_workspace_path: 'D:\\IDEA\\workspace\\agent-mesh',
  members: [{
    id: 'office_test_1781072362758_member_1',
    office_id: 'office_test_1781072362758',
    persona_id: 'persona_claude_code_default',
    role: 'collaborator' as const,
    office_title: '协作 Agent',
    responsibility: 'Claude Code 默认 CLI 身份，适合实现、审查和仓库分析。',
  }],
}

const devMockConfig: AgentMeshConfig = {
  schemaVersion: '0.1',
  stateDir: '.agent-mesh',
  runtimes: {
    runtime_claude_code: { id: 'runtime_claude_code', name: 'Claude Code', kind: 'claude-code', connection_type: 'cli', status: 'available' },
  },
  personas: {
    persona_claude_code_default: { id: 'persona_claude_code_default', runtime_id: 'runtime_claude_code', name: 'default' },
  },
  offices: {
    [smokeOffice.id]: smokeOffice,
  },
  officeMembers: {
    office_test_1781072362758_member_1: smokeOffice.members[0],
  },
  permissionPolicies: {
    policy_local_readonly: { id: 'policy_local_readonly', name: '本地只读', default_mode: 'read-only' },
  },
  taskTypes: {
    task_type_office_test_1781072362758_readonly_repo_inspect: {
      id: 'task_type_office_test_1781072362758_readonly_repo_inspect',
      name: '只读项目检查',
      required_capabilities: ['repo.inspect'],
      default_acceptance: ['说明 agent-mesh 项目是做什么的', '确认没有写入'],
      default_constraints: ['只读检查，不修改文件'],
    },
  },
  routingPolicies: {
    routing_office_test_1781072362758_readonly_repo_inspect: {
      id: 'routing_office_test_1781072362758_readonly_repo_inspect',
      name: 'test 只读检查路由',
      office_id: smokeOffice.id,
      strategy: 'capability-match',
      preferred_member_ids: ['office_test_1781072362758_member_1'],
      required_capabilities: ['repo.inspect'],
    },
  },
}

const smokeLogs: LogTail[] = [{
  path: `.agent-mesh\\tasks\\${smokeTaskId}\\events.jsonl`,
  lines: [
    '{"type":"routing_decision","source":"agent-mesh-router"}',
    '{"type":"delegation_created","source":"agent-mesh-office"}',
    '{"type":"permission_decision","source":"agent-mesh-permission","mode":"read-only"}',
    '{"type":"permission_enforced","skip_permissions_removed":true,"write_detection":true}',
    '{"type":"permission_check_passed","changed_files":[]}',
    '{"type":"agent_run_finished","status":"completed","exitCode":0}',
  ],
}]

// 统一封装 Tauri command，避免页面直接依赖后端命令名。
export const agentMeshApi = {
  loadConfig() {
    if (devBrowserMockEnabled) return Promise.resolve(devMockConfig)
    return invoke<AgentMeshConfig>('load_agent_mesh_config')
  },

  saveConfig(config: AgentMeshConfig) {
    return invoke<AgentMeshConfig>('save_agent_mesh_config', { config })
  },

  listPersonas() {
    if (devBrowserMockEnabled) return Promise.resolve(Object.values(devMockConfig.personas))
    return invoke<Persona[]>('list_personas')
  },

  listOffices() {
    if (devBrowserMockEnabled) return Promise.resolve([smokeOffice])
    return invoke<Office[]>('list_offices')
  },

  saveOffice(payload: SaveOfficePayload) {
    return invoke<AgentMeshConfig>('save_office', { payload })
  },

  deleteOffice(officeId: string) {
    return invoke<AgentMeshConfig>('delete_office', { officeId })
  },

  detectRuntimes() {
    if (devBrowserMockEnabled) return Promise.resolve({ detected_at: String(Date.now()), runtimes: Object.values(devMockConfig.runtimes) })
    return invoke<RuntimeDetectionResponse>('detect_runtimes')
  },

  listRuntimeAdapters() {
    if (devBrowserMockEnabled) return Promise.resolve([])
    return invoke<RuntimeAdapterStatus[]>('list_runtime_adapters')
  },

  discoverLocalAgents() {
    if (devBrowserMockEnabled) return Promise.resolve([])
    return invoke<LocalAgentInventoryItem[]>('discover_local_agents')
  },

  listTasks() {
    if (devBrowserMockEnabled) return Promise.resolve([smokeTaskSummary])
    return invoke<TaskSummary[]>('list_tasks')
  },

  getTaskDetail(taskId: string) {
    if (devBrowserMockEnabled) return Promise.resolve(taskId === smokeTaskId ? smokeTaskDetail : {})
    return invoke<Record<string, unknown>>('get_task_detail', { taskId })
  },

  getTaskLogTail(taskId: string) {
    if (devBrowserMockEnabled) return Promise.resolve(taskId === smokeTaskId ? smokeLogs : [])
    return invoke<LogTail[]>('get_task_log_tail', { taskId })
  },

  getTaskSessionStatus(taskId: string) {
    if (devBrowserMockEnabled) return Promise.resolve({ task_id: taskId, office_member_id: 'office_test_1781072362758_member_1', runtime_id: 'runtime_claude_code', status: 'completed', workspace_path: 'D:\\IDEA\\workspace\\agent-mesh' })
    return invoke<TaskSessionStatus>('get_task_session_status', { taskId })
  },

  createChatTask(payload: CreateChatTaskPayload) {
    return invoke<{ id: string }>('create_chat_task', { payload })
  },

  dispatchChatTask(taskId: string) {
    return invoke('dispatch_chat_task', { taskId })
  },

  cancelTask(taskId: string) {
    return invoke('cancel_task', { taskId })
  },

  retryTask(taskId: string) {
    return invoke<{ id: string }>('retry_task', { taskId })
  },

  resetTaskSession(taskId: string) {
    return invoke<TaskSessionStatus>('reset_task_session', { taskId })
  },
}
