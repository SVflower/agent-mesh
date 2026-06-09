import { describe, expect, it } from "vitest";
import {
  AgentMeshConfigSchema,
  OfficeMemberSchema,
  PersonaSchema,
  RoutingPolicySchema,
  RuntimeSchema,
  TaskSchema,
  TaskSessionSchema,
  TaskTypeSchema
} from "./index.js";

describe("schemas", () => {
  it("validates a claude-code runtime", () => {
    const runtime = RuntimeSchema.parse({
      id: "runtime_claude_code",
      name: "Claude Code",
      kind: "claude-code",
      connection_type: "cli",
      installed: true
    });

    expect(runtime.health).toBe("unknown");
  });

  it("validates an openclaw persona", () => {
    const persona = PersonaSchema.parse({
      id: "persona_openclaw_coco",
      runtime_id: "runtime_openclaw",
      name: "CoCo",
      capabilities: ["coding"],
      source: "manual"
    });

    expect(persona.enabled).toBe(true);
  });

  it("validates office membership as the office-level relationship", () => {
    const member = OfficeMemberSchema.parse({
      id: "member_primary",
      office_id: "office_dev",
      persona_id: "persona_claude_default",
      role: "primary",
      office_title: "主力编程 Agent"
    });

    expect(member.enabled).toBe(true);
  });

  it("validates an async task with default status", () => {
    const now = new Date().toISOString();
    const task = TaskSchema.parse({
      id: "task_1",
      objective: "检查项目结构",
      created_at: now,
      updated_at: now
    });

    expect(task.status).toBe("queued");
    expect(task.requester.type).toBe("user");
  });

  it("validates a task session for observability", () => {
    const now = new Date().toISOString();
    const session = TaskSessionSchema.parse({
      id: "session_1",
      task_id: "task_1",
      office_member_id: "member_primary",
      runtime_id: "runtime_claude_code",
      stdout_log_path: ".agent-mesh/tasks/task_1/stdout.log",
      updated_at: now
    });

    expect(session.status).toBe("unknown");
  });

  it("validates the first-phase Agent Mesh config", () => {
    const config = AgentMeshConfigSchema.parse({
      schemaVersion: "0.1",
      stateDir: ".agent-mesh",
      runtimes: {
        runtime_hermes: {
          id: "runtime_hermes",
          name: "Hermes",
          kind: "hermes",
          connection_type: "cli"
        }
      },
      personas: {
        persona_hermes_default: {
          id: "persona_hermes_default",
          runtime_id: "runtime_hermes",
          name: "default"
        }
      },
      offices: {},
      officeMembers: {}
    });

    expect(config.personas.persona_hermes_default.source).toBe("manual");
  });

  it("validates task type and routing policy models", () => {
    const taskType = TaskTypeSchema.parse({
      id: "task_type_code",
      name: "代码任务",
      required_capabilities: ["code.implement"]
    });
    const routingPolicy = RoutingPolicySchema.parse({
      id: "routing_code",
      name: "代码优先",
      office_id: "office_dev",
      task_type_id: taskType.id,
      preferred_member_ids: ["member_claude"]
    });

    expect(taskType.enabled).toBe(true);
    expect(routingPolicy.strategy).toBe("capability-match");
  });
});
