export type TaskStatus = "created" | "assigned" | "running" | "completed" | "failed" | "blocked" | "cancelled";

export type AgentConfig = {
  name: string;
  type: "claude-cli" | "external";
  description?: string;
  command?: string;
  args?: string[];
  capabilities?: string[];
  sessionMode?: "none" | "resume";
  sessionDir?: string;
  timeoutMs?: number;
};

export type OfficeConfig = {
  name: string;
  primaryNodeId: string;
  secondaryNodeIds?: string[];
  channelIds?: string[];
  projectIds?: string[];
  defaultRoutingPolicyId?: string;
  defaultPermissionPolicyId?: string;
};

export type ProjectConfig = {
  name: string;
  rootPath: string;
  defaultBranch?: string;
};

export type ChannelConfig = {
  type: string;
  officeId: string;
  primaryNodeId: string;
  defaultProjectId?: string;
  permissionMode?: "read-only" | "safe-write" | "full-access";
};

export type AgentMeshConfig = {
  path: string;
  stateDir: string;
  defaultAgent: string;
  agents: Record<string, Omit<AgentConfig, "name">>;
  offices: Record<string, OfficeConfig>;
  projects: Record<string, ProjectConfig>;
  channels: Record<string, ChannelConfig>;
};

export type DesktopRuntime = {
  id: string;
  name: string;
  kind: "hermes" | "openclaw" | "codex" | "claude-code";
  command?: string;
  connection_type?: string;
};

export type DesktopPersona = {
  id: string;
  runtime_id: string;
  name: string;
  profile_key?: string;
  description?: string;
  capabilities?: string[];
  skills?: string[];
  enabled?: boolean;
};

export type DesktopOffice = {
  id: string;
  name: string;
  description?: string;
  default_permission_policy_id?: string;
  default_channel_id?: string;
  default_task_type_id?: string;
  default_routing_policy_id?: string;
  default_workspace_path?: string;
  paused?: boolean;
};

export type DesktopOfficeMember = {
  id: string;
  office_id: string;
  persona_id: string;
  role: "primary" | "collaborator" | "reviewer" | "observer";
  office_title: string;
  responsibility?: string;
  enabled?: boolean;
};

export type DesktopPermissionPolicy = {
  id: string;
  name: string;
  default_mode?: "read-only" | "safe-write" | "full-access";
  require_confirmation?: string[];
  allowed_channels?: string[];
  allowed_runtime_kinds?: DesktopRuntime["kind"][];
};

export type DesktopTaskType = {
  id: string;
  name: string;
  description?: string;
  required_capabilities?: string[];
  default_acceptance?: string[];
  default_constraints?: string[];
  enabled?: boolean;
};

export type DesktopRoutingPolicy = {
  id: string;
  name: string;
  office_id: string;
  task_type_id?: string;
  strategy?: "primary-first" | "capability-match" | "manual" | "round-robin";
  fallback_member_id?: string;
  preferred_member_ids?: string[];
  required_capabilities?: string[];
  enabled?: boolean;
};

export type DesktopChannel = {
  id: string;
  type: string;
  name: string;
  office_id?: string;
  primary_member_id?: string;
  permission_policy_id?: string;
  enabled?: boolean;
};

export type DesktopAgentMeshConfig = {
  path: string;
  stateDir: string;
  schemaVersion?: string;
  runtimes: Record<string, DesktopRuntime>;
  personas: Record<string, DesktopPersona>;
  offices: Record<string, DesktopOffice>;
  officeMembers: Record<string, DesktopOfficeMember>;
  channels?: Record<string, DesktopChannel>;
  permissionPolicies?: Record<string, DesktopPermissionPolicy>;
  taskTypes?: Record<string, DesktopTaskType>;
  routingPolicies?: Record<string, DesktopRoutingPolicy>;
};

export type AcpTask = {
  id: string;
  type: "task.assign";
  from: string;
  to: string;
  role: string;
  objective: string;
  workspace: {
    repo: string;
  };
  context: Record<string, unknown>;
  constraints: {
    may_edit: string[];
    must_not_edit: string[];
  };
  acceptance: string[];
  expected_output: Record<string, unknown>;
  observer?: {
    stateDir: string;
    taskId: string;
  };
};

export type TaskEnvelope = {
  id: string;
  type: "task.assign";
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  agent: string;
  agentType: string;
  task: AcpTask;
  events: Array<Record<string, unknown>>;
  result: AgentResult | null;
};

export type AgentResult = {
  status: "completed" | "failed" | "blocked";
  summary: string;
  changed_files: string[];
  tests: unknown[];
  risks: string[];
  next_steps: string[];
  raw: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    command?: string;
    args?: string[];
    cwd?: string;
  };
};

export type DispatchInput = {
  id: string;
  objective: string;
  agent?: string;
  repo?: string;
  context?: Record<string, unknown>;
  constraints?: {
    may_edit?: string[];
    must_not_edit?: string[];
  };
  acceptance: string[];
  expected_output?: Record<string, unknown>;
  mode?: "async" | "sync";
};

export type OfficeDispatchInput = {
  id?: string;
  office?: string;
  officeId?: string;
  channel?: string;
  objective: string;
  repo?: string;
  context?: Record<string, unknown>;
  acceptance?: string[];
  mode?: "async" | "sync";
  readOnly?: boolean;
};
