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

// 统一封装 Tauri command，避免页面直接依赖后端命令名。
export const agentMeshApi = {
  loadConfig() {
    return invoke<AgentMeshConfig>('load_agent_mesh_config')
  },

  saveConfig(config: AgentMeshConfig) {
    return invoke<AgentMeshConfig>('save_agent_mesh_config', { config })
  },

  listPersonas() {
    return invoke<Persona[]>('list_personas')
  },

  listOffices() {
    return invoke<Office[]>('list_offices')
  },

  saveOffice(payload: SaveOfficePayload) {
    return invoke<AgentMeshConfig>('save_office', { payload })
  },

  detectRuntimes() {
    return invoke<RuntimeDetectionResponse>('detect_runtimes')
  },

  listRuntimeAdapters() {
    return invoke<RuntimeAdapterStatus[]>('list_runtime_adapters')
  },

  discoverLocalAgents() {
    return invoke<LocalAgentInventoryItem[]>('discover_local_agents')
  },

  listTasks() {
    return invoke<TaskSummary[]>('list_tasks')
  },

  getTaskDetail(taskId: string) {
    return invoke<Record<string, unknown>>('get_task_detail', { taskId })
  },

  getTaskLogTail(taskId: string) {
    return invoke<LogTail[]>('get_task_log_tail', { taskId })
  },

  getTaskSessionStatus(taskId: string) {
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
