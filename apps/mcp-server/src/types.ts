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
