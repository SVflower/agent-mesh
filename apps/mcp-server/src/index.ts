#!/usr/bin/env node
import {
  dispatchTask,
  dispatchTaskAsync,
  cancelTask,
  getSessionStatus,
  getNodeStatus,
  getOfficeStatus,
  getTaskEvents,
  getTaskLogTail,
  getTaskStatus,
  listTasks,
  resetSession
} from "./dispatcher.js";
import type { DispatchInput } from "./types.js";

const serverInfo = {
  name: "agent-mesh",
  version: "0.1.0"
};

export const tools = [
  {
    name: "dispatch_agent_task",
    description: "Dispatch a bounded Agent Mesh task to an agent node. Defaults to async mode so long tasks do not hit channel or MCP timeouts. Current backend defaults to the claude-code node.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique task id, for example task_fix_login_001."
        },
        objective: {
          type: "string",
          description: "The exact task the selected agent node should complete."
        },
        agent: {
          type: "string",
          description: "Target agent node id. Defaults to claude-code for the current prototype."
        },
        repo: {
          type: "string",
          description: "Target repository path. Defaults to the current Agent Mesh process working directory."
        },
        context: {
          type: "object",
          description: "Task context such as files, logs, notes, and observed behavior."
        },
        constraints: {
          type: "object",
          description: "Task boundaries, usually may_edit and must_not_edit."
        },
        acceptance: {
          type: "array",
          items: { type: "string" },
          description: "Concrete acceptance criteria."
        },
        expected_output: {
          type: "object",
          description: "Expected output contract."
        },
        mode: {
          type: "string",
          enum: ["async", "sync"],
          description: "async returns immediately with a state file; sync waits for the agent to finish."
        }
      },
      required: ["id", "objective", "acceptance"]
    }
  },
  {
    name: "get_agent_task_status",
    description: "Read the persisted status/result for an Agent Mesh task dispatched by dispatch_agent_task.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Task id returned by dispatch_agent_task."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "list_tasks",
    description: "List recent Agent Mesh tasks from the persisted state directory. Supports optional status filter and limit.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional task status filter, such as running, completed, failed, stale, or cancelled."
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return. Defaults to 50."
        }
      }
    }
  },
  {
    name: "cancel_task",
    description: "Best-effort cancel for a running Agent Mesh task. Current TypeScript worker kills the recorded worker pid when available and marks the task cancelled.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Task id returned by dispatch_agent_task."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "get_task_events",
    description: "Read recent observability events for a task, including heartbeats, process lifecycle, and stdout/stderr chunk previews.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Task id returned by dispatch_agent_task."
        },
        limit: {
          type: "number",
          description: "Maximum number of recent events to return. Defaults to 50."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "get_node_status",
    description: "Read health and workload status for all Agent Mesh nodes or a single node.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Optional node id, such as claude-code or hermes-local."
        }
      }
    }
  },
  {
    name: "get_office_status",
    description: "Read health and workload summary for all Agent Mesh offices or a single office.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Optional office id, such as local-dev-office."
        }
      }
    }
  },
  {
    name: "get_task_log_tail",
    description: "Read the tail of a task stdout or stderr log.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Task id returned by dispatch_agent_task."
        },
        stream: {
          type: "string",
          enum: ["stdout", "stderr"],
          description: "Log stream to read. Defaults to stdout."
        },
        maxChars: {
          type: "number",
          description: "Maximum trailing characters to return. Defaults to 12000."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "get_agent_session_status",
    description: "Read the persisted agent session used for resume mode for a repository. Current prototype returns the default claude-code session.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository path. Defaults to the current Agent Mesh process working directory."
        }
      }
    }
  },
  {
    name: "reset_agent_session",
    description: "Clear the persisted agent resume session for a repository so the next dispatch starts fresh. Current prototype resets the default claude-code session.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository path. Defaults to the current Agent Mesh process working directory."
        }
      }
    }
  }
];

let buffer = Buffer.alloc(0);

export function createMcpServerStatus() {
  return {
    name: serverInfo.name,
    ready: true,
    tools: tools.map((tool) => tool.name)
  };
}

process.stdin.on("data", async (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  await drainMessages();
});

async function drainMessages(): Promise<void> {
  while (buffer.length > 0) {
    const framed = readFramedMessage();
    if (framed === null) {
      const newline = buffer.indexOf(0x0a);
      if (newline < 0) return;

      const line = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      if (line) await handleMessage(line);
      continue;
    }

    if (framed === undefined) return;
    await handleMessage(framed);
  }
}

function readFramedMessage(): string | null | undefined {
  const crlfHeaderEnd = buffer.indexOf("\r\n\r\n");
  const lfHeaderEnd = buffer.indexOf("\n\n");
  const usesCrlf = crlfHeaderEnd >= 0 && (lfHeaderEnd < 0 || crlfHeaderEnd <= lfHeaderEnd);
  const headerEnd = usesCrlf ? crlfHeaderEnd : lfHeaderEnd;

  if (headerEnd < 0) {
    if (buffer.toString("utf8", 0, Math.min(buffer.length, 32)).startsWith("Content-Length:")) {
      return undefined;
    }
    return null;
  }

  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const lengthMatch = /^Content-Length:\s*(\d+)/im.exec(header);
  if (!lengthMatch) return null;

  const contentLength = Number(lengthMatch[1]);
  const bodyStart = headerEnd + (usesCrlf ? 4 : 2);
  const bodyEnd = bodyStart + contentLength;
  if (buffer.length < bodyEnd) return undefined;

  const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
  buffer = buffer.subarray(bodyEnd);
  return body;
}

async function handleMessage(payload: string): Promise<void> {
  let message: any;
  try {
    message = JSON.parse(payload);
  } catch {
    return;
  }

  if (message.id === undefined || message.id === null) {
    return;
  }

  try {
    if (message.method === "initialize") {
      sendResult(message.id, {
        protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo
      });
    } else if (message.method === "tools/list") {
      sendResult(message.id, { tools });
    } else if (message.method === "tools/call") {
      sendResult(message.id, await callTool(message.params));
    } else {
      sendError(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    sendError(message.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

export async function callTool(params: any) {
  if (params?.name === "get_agent_task_status") {
    return toolResult(await getTaskStatus(params.arguments?.id));
  }

  if (params?.name === "list_tasks") {
    return toolResult(await listTasks({
      status: params.arguments?.status,
      limit: params.arguments?.limit ?? 50
    }));
  }

  if (params?.name === "cancel_task") {
    return toolResult(await cancelTask(params.arguments?.id));
  }

  if (params?.name === "get_task_events") {
    return toolResult(await getTaskEvents(
      params.arguments?.id,
      params.arguments?.limit ?? 50
    ));
  }

  if (params?.name === "get_node_status") {
    return toolResult(await getNodeStatus(params.arguments?.id));
  }

  if (params?.name === "get_office_status") {
    return toolResult(await getOfficeStatus(params.arguments?.id));
  }

  if (params?.name === "get_task_log_tail") {
    return toolResult(await getTaskLogTail(
      params.arguments?.id,
      params.arguments?.stream ?? "stdout",
      params.arguments?.maxChars ?? 12000
    ));
  }

  if (params?.name === "get_agent_session_status") {
    return toolResult(await getSessionStatus(params.arguments?.repo ?? "."));
  }

  if (params?.name === "reset_agent_session") {
    return toolResult(await resetSession(params.arguments?.repo ?? "."));
  }

  if (params?.name !== "dispatch_agent_task") {
    throw new Error(`Unknown tool: ${params?.name}`);
  }

  const args = params.arguments as DispatchInput;
  const result = args.mode === "sync"
    ? await dispatchTask(args)
    : await dispatchTaskAsync(args);

  return toolResult(result);
}

function toolResult(result: any) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ],
    isError: result.status === "failed"
  };
}

function sendResult(id: string | number, result: unknown): void {
  write({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id: string | number, code: number, message: string): void {
  write({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function write(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
