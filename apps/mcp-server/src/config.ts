import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig, AgentMeshConfig, DesktopAgentMeshConfig } from "./types.js";

// 默认配置放在仓库根目录，后续桌面端会生成用户级配置并传入路径覆盖。
export async function loadConfig(configPath = path.join(projectRoot(), "agent-mesh.config.json")): Promise<AgentMeshConfig> {
  const desktopConfig = await loadDesktopConfig(configPath);
  const config = desktopConfig as unknown as {
    stateDir?: string;
    defaultAgent?: string;
    agents?: AgentMeshConfig["agents"];
    offices?: AgentMeshConfig["offices"];
    projects?: AgentMeshConfig["projects"];
    channels?: AgentMeshConfig["channels"];
  };

  const agents = config.agents && typeof config.agents === "object"
    ? config.agents
    : synthesizeAgents(desktopConfig);

  return {
    path: desktopConfig.path,
    stateDir: desktopConfig.stateDir,
    defaultAgent: config.defaultAgent ?? "claude-code",
    agents,
    offices: config.offices ?? synthesizeLegacyOffices(desktopConfig),
    projects: config.projects ?? {},
    channels: config.channels ?? {}
  };
}

export async function loadDesktopConfig(configPath = path.join(projectRoot(), "agent-mesh.config.json")): Promise<DesktopAgentMeshConfig> {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  const config = JSON.parse(raw) as Partial<DesktopAgentMeshConfig>;

  return {
    ...config,
    path: absolutePath,
    stateDir: path.resolve(path.dirname(absolutePath), config.stateDir ?? ".agent-mesh"),
    runtimes: config.runtimes ?? {},
    personas: config.personas ?? {},
    offices: config.offices ?? {},
    officeMembers: config.officeMembers ?? {}
  };
}

export function getAgent(config: AgentMeshConfig, name?: string): AgentConfig {
  const agentName = name ?? config.defaultAgent;
  const agent = config.agents[agentName];

  if (!agent) {
    const known = Object.keys(config.agents).join(", ");
    throw new Error(`Unknown agent "${agentName}". Known agents: ${known}`);
  }

  return { name: agentName, ...agent };
}

export function projectRoot(): string {
  return path.resolve(process.cwd());
}

function synthesizeAgents(config: DesktopAgentMeshConfig): AgentMeshConfig["agents"] {
  const agents: AgentMeshConfig["agents"] = {};

  for (const persona of Object.values(config.personas)) {
    if (persona.enabled === false) continue;

    const runtime = config.runtimes[persona.runtime_id];
    if (!runtime) continue;

    if (runtime.kind === "claude-code") {
      agents["claude-code"] = {
        type: "claude-cli",
        command: runtime.command ?? "claude",
        args: ["--output-format", "json", "--dangerously-skip-permissions"],
        description: persona.description ?? "Claude Code synthesized from desktop Persona/Profile.",
        capabilities: persona.capabilities ?? ["repo.inspect", "code.review"],
        sessionMode: "resume"
      };
    }
  }

  if (!agents["claude-code"]) {
    agents["claude-code"] = {
      type: "claude-cli",
      command: "claude",
      args: ["--output-format", "json", "--dangerously-skip-permissions"],
      description: "Default Claude Code agent synthesized for Agent Mesh MCP.",
      capabilities: ["repo.inspect", "code.review"],
      sessionMode: "resume"
    };
  }

  return agents;
}

function synthesizeLegacyOffices(config: DesktopAgentMeshConfig): AgentMeshConfig["offices"] {
  return Object.fromEntries(Object.values(config.offices).map((office) => {
    const members = Object.values(config.officeMembers).filter((member) => member.office_id === office.id);
    const primary = members.find((member) => member.role === "primary") ?? members[0];

    return [office.id, {
      name: office.name,
      primaryNodeId: primary?.id ?? "claude-code",
      secondaryNodeIds: members.filter((member) => member.id !== primary?.id).map((member) => member.id),
      channelIds: Object.values(config.channels ?? {}).filter((channel) => channel.office_id === office.id).map((channel) => channel.id),
      defaultRoutingPolicyId: office.default_routing_policy_id,
      defaultPermissionPolicyId: office.default_permission_policy_id
    }];
  }));
}
