# Agent Mesh

Agent Mesh 是面向本地 AI Agent 的团队协作控制平面——把 Codex、Hermes、Claude Code、OpenClaw 等本地 Agent 组队到一起，形成可视化的办公室协作团队。

## 产品定位

```text
跨平台 Agent 团队的组织层、调度层和可观测层
```

用户只需与主 Agent（Captain）对话，Captain 负责理解、拆解和分配任务；Agent Mesh 负责维护办公室、成员、权限、路由、任务状态，并把团队内部对话、工具调用和行为逻辑可视化出来。

当前支持的 Agent Runtime：

- **Hermes** — 飞书/多渠道入口，适合作为 Captain
- **Claude Code** — 代码实现与仓库分析
- **Codex** — 规划与验证
- **OpenClaw** — 多 Agent 模式（花卷等）

## 核心模型

```text
Runtime
  -> Persona / Profile
     -> OfficeMember
        -> Captain / Delegation / AgentMessage / ToolCall / TaskSession
```

- **Runtime**：本机软件或运行环境（Hermes、OpenClaw、Codex、Claude Code）。
- **Persona / Profile**：Runtime 内部可选择的具体身份（如 OpenClaw/花卷、Hermes/feishu-primary）。
- **Office**：用户组建的协作团队，包含一个 Captain 和多个协作成员。
- **OfficeMember**：某个 Persona 加入办公室后的角色、职责和权限。
- **Captain**：办公室中的主 Agent，动态确定——谁接收用户请求谁就是 Captain。
- **TaskSession**：任务执行产生的上下文、事件、日志和结果。

## 核心能力

### 已实现（V0.1 MVP）

- ✅ 本地 Agent Runtime 自动检测（安装状态、版本、CLI 路径）
- ✅ Persona/Profile 管理（新增、编辑、启用/禁用）
- ✅ 办公室创建向导（选择 Captain + 协作成员 + 权限策略 + 渠道绑定）
- ✅ Agent Mesh Chat 本地任务入口
- ✅ 异步任务派发与可观测（状态、事件、日志、结果、诊断）
- ✅ Claude Code adapter 真实验证通过
- ✅ MCP Server（11 个工具，支持 Hermes 对接）

### 设计中（V0.2 办公室生态）

- 🔲 Captain 动态切换（`upgrade_to_captain`）
- 🔲 Agent 团队意识（`get_my_team` / `get_office_context`）
- 🔲 办公室事件流（`report_to_office` / `broadcast_to_team`）
- 🔲 办公室独立目录（`team.json` + `events.jsonl`）
- 🔲 Prompt 自动注入团队上下文
- 🔲 任务调度 DAG 可视化

## 技术栈

```text
Tauri 2 + React 19 + TypeScript 5.7 + Vite 7 + Rust
```

- 前端：React + 纯自定义 CSS（暗色主题），无组件库依赖
- 后端：Tauri 2 Rust commands（16 个），负责 Runtime 检测、进程管理、配置持久化
- MCP Server：TypeScript，提供标准 MCP stdio 协议
- 第一阶段 TypeScript 优先，Rust 逐步接管 daemon 和进程管理

## 仓库结构

```text
agent-mesh/
  apps/
    mcp-server/              # Agent Mesh MCP server（11+ 工具）
    desktop/                 # Tauri + React 桌面端
      src/
        pages/               # 按域拆分：offices, agents, tasks, chat, settings, dashboard
        components/common/   # 共享组件：AgentLogo, Status, Panel, LogPreview 等
        services/            # Tauri invoke 网关
        hooks/               # 启动加载逻辑
        types/               # 共享 TypeScript 类型
        i18n/                # 多语言（zh/en/ja）
  packages/
    schemas/                 # Zod schema 和核心类型
    core/                    # 任务状态机等核心逻辑
  docs/                      # 产品、架构、MVP、开发文档
    office-system-design.md  # V0.2 办公室生态设计方案
  .agent-mesh/               # 运行态数据（tasks、offices）
```

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm build                # 构建所有包
pnpm test                 # 运行测试
cargo test                # Rust 测试

# 桌面端开发
pnpm dev:desktop          # 启动 Tauri 开发窗口（需要 Rust stable）

# MCP Server
pnpm dev:mcp              # 开发模式（不适合注册到 Hermes）
```

注册 MCP server 到 Hermes 时使用构建产物，避免 pnpm stdout 干扰：

```bash
node D:\IDEA\workspace\agent-mesh\apps\mcp-server\dist\index.js
```

## MCP 工具

Agent Mesh 通过 MCP Server 向 Captain Agent（如 Hermes）提供团队调度能力：

| 工具 | 功能 |
|------|------|
| `dispatch_office_task` | 通过办公室派发任务 |
| `get_agent_task_status` | 查询任务状态 |
| `list_tasks` | 列出近期任务 |
| `cancel_task` | 取消任务 |
| `get_task_events` | 查询任务事件流 |
| `get_task_log_tail` | 读取日志尾部 |
| `get_office_status` | 查询办公室状态 |

V0.2 规划新增（Agent 团队意识）：

| 工具 | 功能 |
|------|------|
| `get_my_team` | Agent 查询自己的团队信息 |
| `get_office_context` | 获取办公室全局上下文 |
| `upgrade_to_captain` | 动态升级为 Captain |
| `report_to_office` | 向办公室报告事件 |
| `broadcast_to_team` | 向团队广播消息 |

## AI 协作开发约定

- 所有业务代码必须有中文注释。
- 注释解释关键意图、边界、状态变化和失败行为。
- 新功能先写 schema / 类型，再写实现。
- 较大功能需要保留学习式变更说明，方便边开发边学习。

## 文档

- [文档导航](docs/README.md) — 全部文档入口
- [当前进展](docs/current-progress.md) — 已验证能力、工程状态和限制
- [办公室生态设计](docs/office-system-design.md) — V0.2 核心方案（Captain 动态化、团队意识、新 MCP 工具）
- [路线图](docs/roadmap.md) — 阶段计划（1-9）
- [数据模型](docs/data-model.md) — 18 个核心类型定义
- [架构设计](docs/architecture.md) — 控制平面、Adapter、存储
- [PRD](docs/prd.md) — 产品定位与场景
- [MVP 范围](docs/mvp-scope.md) — V0.1 验收标准
- [开发日志](docs/development-log.md) — 按日期记录进展
- [术语表](docs/glossary.md) — 项目术语统一定义

## License

MIT
