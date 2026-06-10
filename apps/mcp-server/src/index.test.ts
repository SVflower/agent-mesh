import { describe, expect, it } from "vitest";
import { createMcpServerStatus, tools } from "./index.js";

describe("mcp server", () => {
  it("reports the server bootstrap status and tool names", () => {
    expect(createMcpServerStatus()).toMatchObject({
      name: "agent-mesh",
      ready: true
    });
    expect(createMcpServerStatus().tools).toContain("dispatch_agent_task");
  });

  it("exposes the MVP tool surface", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "dispatch_office_task",
      "dispatch_agent_task",
      "get_agent_task_status",
      "list_tasks",
      "cancel_task",
      "get_task_events",
      "get_node_status",
      "get_office_status",
      "get_task_log_tail",
      "get_agent_session_status",
      "reset_agent_session"
    ]);
  });
});
