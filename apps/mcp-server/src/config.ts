import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig, AgentMeshConfig } from "./types.js";

// 默认配置放在仓库根目录，后续桌面端会生成用户级配置并传入路径覆盖。
export async function loadConfig(configPath = path.join(projectRoot(), "agent-mesh.config.json")): Promise<AgentMeshConfig> {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  const config = JSON.parse(raw) as {
    stateDir?: string;
    defaultAgent?: string;
    agents?: AgentMeshConfig["agents"];
    offices?: AgentMeshConfig["offices"];
    projects?: AgentMeshConfig["projects"];
    channels?: AgentMeshConfig["channels"];
  };

  if (!config.agents || typeof config.agents !== "object") {
    throw new Error("Config must define agents.");
  }

  return {
    path: absolutePath,
    stateDir: path.resolve(path.dirname(absolutePath), config.stateDir ?? ".agent-mesh"),
    defaultAgent: config.defaultAgent ?? "claude-code",
    agents: config.agents,
    offices: config.offices ?? {},
    projects: config.projects ?? {},
    channels: config.channels ?? {}
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
