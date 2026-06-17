import { z } from "zod";

export const RuntimeKindSchema = z.enum(["hermes", "openclaw", "codex", "claude-code"]);
export const RuntimeHealthSchema = z.enum(["unknown", "online", "offline", "degraded"]);

// Runtime 表示本机可用的软件或运行环境，不等同于办公室里的具体成员身份。
export const RuntimeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: RuntimeKindSchema,
  connection_type: z.enum(["cli", "mcp", "http", "desktop", "daemon"]),
  command: z.string().optional(),
  executable_path: z.string().optional(),
  endpoint: z.string().url().optional(),
  installed: z.boolean().default(false),
  health: RuntimeHealthSchema.default("unknown"),
  version: z.string().optional(),
  detected_at: z.string().optional(),
  notes: z.string().optional()
});

// Persona 是 Runtime 内部可被选择的身份，例如 OpenClaw 的 CoCo 或 Hermes 的某个 profile。
export const PersonaSchema = z.object({
  id: z.string().min(1),
  runtime_id: z.string().min(1),
  name: z.string().min(1),
  profile_key: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  mcp_bindings: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  source: z.enum(["detected", "manual", "imported", "default"]).default("manual")
});

export const OfficeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  default_permission_policy_id: z.string().optional(),
  default_channel_id: z.string().optional(),
  default_task_type_id: z.string().optional(),
  default_routing_policy_id: z.string().optional(),
  default_workspace_path: z.string().optional(),
  context_dir: z.string().optional(),
  team_file_path: z.string().optional(),
  event_log_path: z.string().optional(),
  project_context: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      repo_paths: z.array(z.string()).default([]),
      key_docs: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([])
    })
    .optional(),
  paused: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

export const OfficeMemberHealthSchema = z.enum(["unknown", "online", "offline", "busy"]);

// OfficeMember 表示某个 Persona 加入某个办公室后的角色，是办公室内部的成员关系。
export const OfficeMemberSchema = z.object({
  id: z.string().min(1),
  office_id: z.string().min(1),
  persona_id: z.string().min(1),
  role: z.enum(["primary", "collaborator", "reviewer", "observer"]),
  office_title: z.string().min(1),
  responsibility: z.string().optional(),
  enabled: z.boolean().default(true),
  can_be_captain: z.boolean().default(true),
  health: OfficeMemberHealthSchema.default("unknown"),
  last_active_at: z.string().optional()
});

export const OfficeCaptainStateSchema = z.object({
  office_id: z.string().min(1),
  current_captain_member_id: z.string().min(1),
  promoted_at: z.string().min(1),
  promoted_by: z.enum(["channel_entry", "self_upgrade", "manual", "system"]),
  source_channel_id: z.string().optional(),
  previous_captain_member_id: z.string().optional()
});

export const OfficeEventSchema = z.object({
  id: z.string().min(1),
  office_id: z.string().min(1),
  type: z.enum([
    "captain_promoted",
    "member_joined",
    "member_left",
    "task_assigned",
    "task_completed",
    "task_failed",
    "progress_report",
    "broadcast",
    "context_updated"
  ]),
  from_member_id: z.string().optional(),
  to_member_id: z.string().optional(),
  message: z.string().optional(),
  data: z.record(z.unknown()).default({}),
  created_at: z.string().min(1)
});

export const ChannelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["agent-mesh-chat", "feishu", "wechat", "discord", "cli", "api"]),
  name: z.string().min(1),
  office_id: z.string().min(1),
  primary_member_id: z.string().min(1),
  permission_policy_id: z.string().optional(),
  enabled: z.boolean().default(true)
});

export const TaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "stale"
]);

export const TaskResultSchema = z.object({
  status: z.enum(["completed", "failed", "cancelled"]).optional(),
  summary: z.string().default(""),
  changed_files: z.array(z.string()).default([]),
  tests: z
    .array(
      z.object({
        status: z.enum(["passed", "failed", "not_run"]),
        command: z.string(),
        output: z.string().optional()
      })
    )
    .default([]),
  risks: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
  raw: z.unknown().optional()
});

// Task 是异步长任务的审计单元，dispatch 后应立即返回 task_id。
export const TaskSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  status: TaskStatusSchema.default("queued"),
  requester: z
    .object({
      type: z.enum(["user", "channel", "runtime", "system"]),
      id: z.string().optional(),
      display_name: z.string().optional()
    })
    .default({ type: "user" }),
  office_id: z.string().optional(),
  assigned_member_id: z.string().optional(),
  parent_task_id: z.string().optional(),
  workspace_path: z.string().optional(),
  required_capabilities: z.array(z.string()).default([]),
  context: z.record(z.unknown()).default({}),
  constraints: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
  result: TaskResultSchema.optional(),
  diagnostic: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  completed_at: z.string().optional()
});

// TaskEvent 是 UI、Channel 回报和问题排查共同依赖的事件记录。
export const TaskEventSchema = z.object({
  id: z.string().min(1),
  task_id: z.string().min(1),
  type: z.string().min(1),
  message: z.string().optional(),
  data: z.record(z.unknown()).default({}),
  created_at: z.string().optional()
});

// TaskSession 记录某次任务与 Runtime 会话、工作目录、日志之间的关系。
export const TaskSessionSchema = z.object({
  id: z.string().min(1),
  task_id: z.string().min(1),
  office_member_id: z.string().min(1),
  runtime_id: z.string().min(1),
  runtime_session_id: z.string().optional(),
  status: z.enum(["unknown", "active", "completed", "expired", "reset"]).default("unknown"),
  workspace_path: z.string().optional(),
  stdout_log_path: z.string().optional(),
  stderr_log_path: z.string().optional(),
  events_path: z.string().optional(),
  updated_at: z.string().optional()
});

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  runtime_kinds: z.array(RuntimeKindSchema).default([])
});

export const McpBindingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  runtime_id: z.string().optional(),
  persona_id: z.string().optional(),
  server_name: z.string().min(1),
  tools: z.array(z.string()).default([]),
  enabled: z.boolean().default(true)
});

export const PermissionPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  default_mode: z.enum(["read-only", "safe-write", "full-access"]).default("read-only"),
  require_confirmation: z.array(z.string()).default([]),
  allowed_channels: z.array(z.string()).default([]),
  allowed_runtime_kinds: z.array(RuntimeKindSchema).default([])
});

export const TaskTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  required_capabilities: z.array(z.string()).default([]),
  default_acceptance: z.array(z.string()).default([]),
  default_constraints: z.array(z.string()).default([]),
  enabled: z.boolean().default(true)
});

export const RoutingPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  office_id: z.string().min(1),
  task_type_id: z.string().optional(),
  strategy: z.enum(["primary-first", "capability-match", "manual", "round-robin"]).default("capability-match"),
  fallback_member_id: z.string().optional(),
  preferred_member_ids: z.array(z.string()).default([]),
  required_capabilities: z.array(z.string()).default([]),
  enabled: z.boolean().default(true)
});

export const AgentMeshConfigSchema = z.object({
  schemaVersion: z.string().default("0.1"),
  stateDir: z.string().default(".agent-mesh"),
  runtimes: z.record(RuntimeSchema).default({}),
  personas: z.record(PersonaSchema).default({}),
  offices: z.record(OfficeSchema).default({}),
  officeMembers: z.record(OfficeMemberSchema).default({}),
  channels: z.record(ChannelSchema).default({}),
  skills: z.record(SkillSchema).default({}),
  mcpBindings: z.record(McpBindingSchema).default({}),
  permissionPolicies: z.record(PermissionPolicySchema).default({}),
  taskTypes: z.record(TaskTypeSchema).default({}),
  routingPolicies: z.record(RoutingPolicySchema).default({})
});

export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;
export type Runtime = z.infer<typeof RuntimeSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Office = z.infer<typeof OfficeSchema>;
export type OfficeMemberHealth = z.infer<typeof OfficeMemberHealthSchema>;
export type OfficeMember = z.infer<typeof OfficeMemberSchema>;
export type OfficeCaptainState = z.infer<typeof OfficeCaptainStateSchema>;
export type OfficeEvent = z.infer<typeof OfficeEventSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type TaskSession = z.infer<typeof TaskSessionSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type McpBinding = z.infer<typeof McpBindingSchema>;
export type PermissionPolicy = z.infer<typeof PermissionPolicySchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;
export type AgentMeshConfig = z.infer<typeof AgentMeshConfigSchema>;
