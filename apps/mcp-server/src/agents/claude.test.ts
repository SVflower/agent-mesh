import { describe, expect, it } from "vitest";
import { normalizeClaudeResult, sanitizeClaudeArgs } from "./claude.js";

describe("claude adapter", () => {
  it("removes prompt/session args because Agent Mesh sends prompt through stdin", () => {
    expect(sanitizeClaudeArgs([
      "-p",
      "--output-format",
      "json",
      "--resume",
      "abc",
      "--dangerously-skip-permissions"
    ])).toEqual(["--output-format", "json", "--dangerously-skip-permissions"]);
  });

  it("normalizes JSON result from Claude stdout", () => {
    const result = normalizeClaudeResult({
      exitCode: 0,
      stdout: JSON.stringify({
        status: "completed",
        summary: "完成",
        changed_files: ["README.md"],
        tests: [],
        risks: [],
        next_steps: []
      }),
      stderr: "",
      command: "claude",
      args: [],
      cwd: "."
    });

    expect(result.status).toBe("completed");
    expect(result.changed_files).toEqual(["README.md"]);
  });
});

