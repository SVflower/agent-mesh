# Agent Mesh

Agent Mesh 是一个面向本地 Agent Runtime 的协作控制平面。

当前 MVP 只针对四个产品：

- Hermes
- OpenClaw
- Codex
- Claude Code

当前产品定位是：

```text
本地 Agent 资产库
  + 可组装办公室
  + 长任务可观测工作台
```

长期愿景是让不同 Agent 都能在权限、上下文和可观测性受控的前提下发起或执行任务。但第一版不做泛化大平台，先把四产品闭环跑稳。

## 核心模型

Agent Mesh 不再把一个软件直接当成一个 Agent 节点，而是使用：

```text
Runtime
  -> Persona / Profile
     -> OfficeMember
        -> TaskSession
```

- Runtime：本机软件或运行环境，例如 Hermes、OpenClaw、Codex、Claude Code。
- Persona / Profile：Runtime 内部可被选择的具体身份，例如 OpenClaw / CoCo、Hermes / feishu-primary。
- OfficeMember：某个 Persona/Profile 加入某个办公室后的角色。
- TaskSession：某次任务产生的上下文、事件、日志和结果。

## 技术栈

```text
Tauri 2 + React + TypeScript + Rust
```

第一阶段 TypeScript 优先，先把 schema、控制面、MCP server、worker 和 Claude Code adapter 跑通；后续由 Rust 逐步接管 daemon、worker runtime、进程管理和桌面原生能力。

## 当前仓库结构

```text
agent-mesh/
  apps/
    mcp-server/          # Agent Mesh MCP server 原型
    desktop/             # Tauri + React 桌面端
  packages/
    schemas/             # Zod schema 和核心类型
    core/                # 任务状态机等核心逻辑
  configs/               # 本地配置示例
  docs/                  # 产品、架构、MVP、开发文档
  examples/              # 最小可运行示例
```

## 开发命令

```text
pnpm install
pnpm test
pnpm build
pnpm dev:desktop
pnpm dev:mcp
```

桌面端当前已完成 React/Vite 与 Tauri 2 配置初始化。若要运行原生 Tauri 窗口，需要先安装 Rust stable 并确保 `cargo` 在 PATH 中。

MCP stdio 场景不要通过 `pnpm dev:mcp` 注册到 Hermes，因为 pnpm 会向 stdout 输出自身日志。注册 MCP server 时使用构建产物：

```text
node D:\IDEA\workspace\agent-mesh\apps\mcp-server\dist\index.js
```

当前 MCP server 仍保留部分原型工具名，例如 `get_node_status`。这些工具可用于兼容当前 Hermes 测试链路，后续会迁移到 Runtime / Persona / OfficeMember 语义。

## AI 协作开发约定

- 所有业务代码必须有中文注释。
- 注释解释关键意图、边界、状态变化和失败行为。
- 新功能先写 schema / 类型，再写实现。
- 较大功能需要保留学习式变更说明，方便边开发边学习。

## 文档

- [文档导航](docs/README.md)
- [产品审计与重规划建议](docs/product-audit-and-replan.md)
- [当前进展](docs/current-progress.md)
- [PRD](docs/prd.md)
- [MVP 范围](docs/mvp-scope.md)
- [架构设计](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [路线图](docs/roadmap.md)
- [技术栈决策](docs/tech-stack-decision.md)
- [开发指南](docs/development.md)
- [Stitch 原型提示词](docs/stitch-prototype-prompts.md)
