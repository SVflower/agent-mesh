import { describe, expect, it } from "vitest";
import {
  AgentMeshConfigSchema,
  OfficeCaptainStateSchema,
  OfficeEventSchema,
  OfficeMemberSchema,
  OfficeSchema,
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
    expect(member.can_be_captain).toBe(true);
    expect(member.health).toBe("unknown");
  });

  it("validates office runtime context fields", () => {
    const office = OfficeSchema.parse({
      id: "office_dev",
      name: "本地开发办公室",
      context_dir: ".agent-mesh/offices/office_dev",
      team_file_path: ".agent-mesh/offices/office_dev/team.json",
      event_log_path: ".agent-mesh/offices/office_dev/events.jsonl",
      project_context: {
        repo_paths: ["D:/IDEA/workspace/agent-mesh"],
        key_docs: ["docs/roadmap.md"],
        tags: ["local", "desktop"]
      }
    });

    expect(office.project_context?.repo_paths).toEqual(["D:/IDEA/workspace/agent-mesh"]);
    expect(office.project_context?.key_docs).toEqual(["docs/roadmap.md"]);
  });

  it("validates runtime captain state", () => {
    const captain = OfficeCaptainStateSchema.parse({
      office_id: "office_dev",
      current_captain_member_id: "member_primary",
      promoted_at: new Date().toISOString(),
      promoted_by: "channel_entry",
      source_channel_id: "channel_chat"
    });

    expect(captain.current_captain_member_id).toBe("member_primary");
  });

  it("validates office event payload", () => {
    const event = OfficeEventSchema.parse({
      id: "event_1",
      office_id: "office_dev",
      type: "context_updated",
      message: "办公室上下文已刷新",
      created_at: new Date().toISOString(),
      data: {
        repo_paths: ["D:/IDEA/workspace/agent-mesh"]
      }
    });

    expect(event.data.repo_paths).toEqual(["D:/IDEA/workspace/agent-mesh"]);
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
