import type { AcpTask } from "./types.js";

// 提示词把任务边界、验收标准和输出格式一次性写清楚，减少 Agent 自由发挥导致的不可验收结果。
export function buildClaudePrompt(task: AcpTask): string {
  return [
    "你正在作为 Agent Mesh 通过 Agent Communication Protocol 派发的 Claude Code agent 执行任务。",
    "",
    "请严格遵守任务边界、上下文、状态、验证标准和结果格式。",
    "",
    "执行要求：",
    "- 先理解 objective、context、constraints、acceptance。",
    "- 只在 constraints.may_edit 允许时修改文件；若为空数组，视为只读任务。",
    "- 不要修改 constraints.must_not_edit 中的文件。",
    "- 如果任务无法完成，说明 blocked 的具体原因。",
    "- 结果必须说明修改文件、验证动作、风险和后续建议。",
    "",
    "请按以下 JSON 结构输出最终结果。不要输出 Markdown 代码围栏：",
    JSON.stringify(
      {
        status: "completed | failed | blocked",
        summary: "简短总结",
        changed_files: ["path/to/file"],
        tests: [
          {
            command: "npm test",
            status: "passed | failed | not_run",
            output: "关键输出摘要"
          }
        ],
        risks: ["未解决风险"],
        next_steps: ["建议下一步"]
      },
      null,
      2
    ),
    "",
    "ACP Task:",
    JSON.stringify(task, null, 2)
  ].join("\n");
}

