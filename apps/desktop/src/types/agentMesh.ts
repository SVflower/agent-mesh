export type RuntimeKind = 'hermes' | 'openclaw' | 'codex' | 'claude-code'

export type RuntimeStatus = 'available' | 'missing' | 'unknown' | 'degraded' | 'online' | 'offline' | 'completed' | 'running' | 'failed' | 'standby'

export type PermissionMode = 'read-only' | 'safe-write' | 'full-access'

export type RuntimeAsset = {
  id: string
  name: string
  kind: RuntimeKind
  connection_type: string
  command?: string
  installed?: boolean
  health?: string
  status?: RuntimeStatus
  executable_path?: string
  version?: string
  detected_at?: string
  diagnostic?: string
  capabilities?: string[]
  skills?: string[]
  mcps?: string[]
  best_for?: string[]
}

export type RuntimeDetectionResponse = {
  detected_at: string
  runtimes: RuntimeAsset[]
}

export type AdapterCapabilityState = 'implemented' | 'verified' | 'manual' | 'planned' | 'default'

export type RuntimeAdapterStatus = {
  runtime_kind: RuntimeKind
  display_name: string
  detect: AdapterCapabilityState
  list_personas: AdapterCapabilityState
  dispatch: AdapterCapabilityState
  cancel: AdapterCapabilityState
  session_status: AdapterCapabilityState
  notes: string
}

export type Persona = {
  id: string
  runtime_id: string
  name: string
  profile_key?: string
  description?: string
  capabilities?: string[]
  skills?: string[]
  mcp_bindings?: string[]
  enabled?: boolean
  source?: string
  runtime?: RuntimeAsset
}

export type OfficeMember = {
  id: string
  office_id: string
  persona_id: string
  role: 'primary' | 'collaborator' | 'reviewer' | 'observer'
  office_title: string
  responsibility?: string
  enabled?: boolean
  persona?: Persona
  runtime?: RuntimeAsset
}

export type Channel = {
  id: string
  type: string
  name: string
  office_id?: string
  primary_member_id?: string
  permission_policy_id?: string
  enabled?: boolean
}

export type PermissionPolicy = {
  id: string
  name: string
  default_mode?: PermissionMode
  require_confirmation?: string[]
  allowed_channels?: string[]
  allowed_runtime_kinds?: RuntimeKind[]
}

export type TaskType = {
  id: string
  name: string
  description?: string
  required_capabilities?: string[]
  default_acceptance?: string[]
  default_constraints?: string[]
  enabled?: boolean
}

export type RoutingPolicy = {
  id: string
  name: string
  office_id: string
  task_type_id?: string
  strategy?: 'primary-first' | 'capability-match' | 'manual' | 'round-robin'
  fallback_member_id?: string
  preferred_member_ids?: string[]
  required_capabilities?: string[]
  enabled?: boolean
}

export type Office = {
  id: string
  name: string
  description?: string
  default_permission_policy_id?: string
  default_channel_id?: string
  default_task_type_id?: string
  default_routing_policy_id?: string
  default_workspace_path?: string
  paused?: boolean
  created_at?: string
  updated_at?: string
  members?: OfficeMember[]
  channels?: Channel[]
}

export type AgentMeshConfig = {
  schemaVersion: string
  stateDir: string
  runtimes: Record<string, RuntimeAsset>
  personas: Record<string, Persona>
  offices: Record<string, Office>
  officeMembers: Record<string, OfficeMember>
  channels?: Record<string, Channel>
  skills?: Record<string, unknown>
  mcpBindings?: Record<string, unknown>
  permissionPolicies?: Record<string, PermissionPolicy>
  taskTypes?: Record<string, TaskType>
  routingPolicies?: Record<string, RoutingPolicy>
}

export type TaskSummary = {
  id: string
  status: RuntimeStatus
  objective: string
  agent: string
  agent_type: string
  workspace_path?: string
  created_at?: string
  updated_at?: string
  completed_at?: string
}

export type LogTail = {
  path: string
  lines: string[]
}

export type TaskSessionStatus = {
  id?: string
  task_id?: string
  office_member_id?: string
  runtime_id?: string
  runtime_session_id?: string
  status?: string
  workspace_path?: string
  stdout_log_path?: string
  stderr_log_path?: string
  events_path?: string
  updated_at?: string
  reset_at?: string
}

export type CreateChatTaskPayload = {
  office_id: string
  task_type_id: string
  routing_policy_id: string
  assigned_member_id: string
  objective: string
  context: string
  acceptance: string[]
  constraints: string[]
}

export type SaveOfficePayload = {
  office: Office
  members: OfficeMember[]
  channel?: Channel
}
