import { type ReactElement, useEffect, useMemo, useState } from 'react'
import { LogPreview, Status } from '../../components/common'
import { agentMeshApi } from '../../services/agentMeshApi'
import type { AgentMeshConfig, LogTail, Office, OfficeMember, RoutingPolicy, TaskSessionStatus, TaskSummary, TaskType } from '../../types/agentMesh'
import { extractResultSummary, formatDate, getTaskDiagnostics, taskObjectiveLabel } from '../../utils/taskDisplay'
import { compactLogLines, deriveDispatchGraph, extractTaskUsage, formatTaskDuration } from '../../utils/taskGraph'

type Translator = (key: string) => string

export function TasksPage({ config, offices, t }: { config: AgentMeshConfig; offices: Office[]; t: Translator }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Record<string, unknown> | null>(null)
  const [selectedSession, setSelectedSession] = useState<TaskSessionStatus | null>(null)
  const [logs, setLogs] = useState<LogTail[]>([])
  const [draft, setDraft] = useState('检查 agent-mesh 项目当前能实现什么功能，并指出下一步 UI 和产品设计问题。')
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? '')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishState, setPublishState] = useState<'idle' | 'publishing'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)
  const [reportTask, setReportTask] = useState<TaskSummary | null>(null)

  const selectedOffice = offices.find((office) => office.id === officeId) ?? offices[0]
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const diagnostics = selectedTaskDetail ? getTaskDiagnostics(selectedTaskDetail).slice(0, 5) : []
  const logLines = useMemo(() => compactLogLines(logs, 24), [logs])
  const graph = useMemo(() => deriveDispatchGraph(selectedTask, selectedTaskDetail, selectedSession, logs), [logs, selectedSession, selectedTask, selectedTaskDetail])
  const canPublish = Boolean(selectedOffice && draft.trim() && publishState !== 'publishing')

  useEffect(() => {
    if (!officeId && offices[0]) setOfficeId(offices[0].id)
  }, [officeId, offices])

  useEffect(() => {
    void refreshTasks()
  }, [])

  useEffect(() => {
    if (!selectedTask?.id) {
      setSelectedTaskDetail(null)
      setSelectedSession(null)
      setLogs([])
      return
    }

    let cancelled = false
    setDetailLoading(true)
    Promise.all([
      agentMeshApi.getTaskDetail(selectedTask.id),
      agentMeshApi.getTaskLogTail(selectedTask.id),
      agentMeshApi.getTaskSessionStatus(selectedTask.id).catch(() => null),
    ]).then(([detail, nextLogs, session]) => {
      if (cancelled) return
      setSelectedTaskDetail(detail)
      setLogs(nextLogs)
      setSelectedSession(session)
    }).catch(() => {
      if (cancelled) return
      setSelectedTaskDetail(null)
      setLogs([])
      setSelectedSession(null)
    }).finally(() => {
      if (!cancelled) setDetailLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [selectedTask?.id])

  async function refreshTasks(nextSelectedId = selectedTaskId) {
    setLoading(true)
    setError(null)
    try {
      const next = await agentMeshApi.listTasks()
      setTasks(next)
      setSelectedTaskId(next.some((task) => task.id === nextSelectedId) ? nextSelectedId : next[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function publishTask() {
    if (!selectedOffice || !draft.trim()) return
    const taskType = selectTaskType(config, selectedOffice)
    const routingPolicy = selectRoutingPolicy(config, selectedOffice)
    const executor = selectExecutorMember(selectedOffice.members ?? [], routingPolicy, taskType)
    if (!taskType || !routingPolicy || !executor) {
      setActionError('当前办公室缺少任务类型、路由策略或可执行成员，无法发布。')
      return
    }

    setPublishState('publishing')
    setActionError(null)
    try {
      const result = await agentMeshApi.createChatTask({
        office_id: selectedOffice.id,
        task_type_id: taskType.id,
        routing_policy_id: routingPolicy.id,
        assigned_member_id: executor.id,
        objective: draft.trim(),
        context: `从 Tasks 页面发布到办公室：${selectedOffice.name}`,
        acceptance: taskType.default_acceptance ?? ['输出执行结论和关键发现'],
        constraints: taskType.default_constraints ?? ['遵守办公室权限策略'],
      })
      await agentMeshApi.dispatchChatTask(result.id)
      await refreshTasks(result.id)
      setSelectedTaskId(result.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setPublishState('idle')
    }
  }

  async function runTaskAction(action: 'cancel' | 'retry' | 'reset', task: TaskSummary) {
    setActionError(null)
    try {
      if (action === 'cancel') await agentMeshApi.cancelTask(task.id)
      if (action === 'retry') {
        const result = await agentMeshApi.retryTask(task.id)
        await refreshTasks(result.id)
        return
      }
      if (action === 'reset') await agentMeshApi.resetTaskSession(task.id)
      await refreshTasks(task.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="dispatchPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">TASK DISPATCH</p>
          <h1>任务调度可视化</h1>
          <p>观察用户请求如何进入主 Agent、分发给协作 Agent，并回传工具调用和执行结果。</p>
        </div>
        <button onClick={() => void refreshTasks()}>{t('actions.refresh')}</button>
      </header>

      <section className="taskPromptBar">
        <select value={selectedOffice?.id ?? ''} onChange={(event) => setOfficeId(event.target.value)}>
          {offices.length === 0 ? <option value="">暂无办公室</option> : null}
          {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button disabled={!canPublish} onClick={() => void publishTask()}>
          {publishState === 'publishing' ? '发布中...' : '发布到当前办公室'}
        </button>
      </section>
      {actionError ? <div className="errorNotice"><strong>操作失败</strong><span>{actionError}</span></div> : null}

      <section className="dispatchLayout">
        <main className="dispatchCanvas">
          {graph.nodes.length === 1 && graph.nodes[0].id === 'empty' ? (
            <div className="flowEmptyNode">
              <strong>{graph.nodes[0].label}</strong>
              <span>{graph.nodes[0].caption}</span>
            </div>
          ) : (
            graph.nodes.map((node) => (
              <DispatchNode key={node.id} node={node} />
            )).reduce<ReactElement[]>((items, node, index) => {
              items.push(node)
              const edge = graph.edges[index]
              if (edge) items.push(<FlowLine key={edge.id} label={edge.label} />)
              return items
            }, [])
          )}
        </main>

        <aside className="dispatchInspector">
          <section className="inspectorPanel">
            <div className="panelTitleRow">
              <div>
                <p className="eyebrow">RECENT</p>
                <h2>任务列表</h2>
              </div>
              <Status value={selectedTask?.status ?? 'standby'} label={selectedTask?.status ?? 'none'} />
            </div>
            {loading ? <SkeletonRows /> : null}
            {error ? <div className="errorNotice compact"><strong>加载失败</strong><button onClick={() => void refreshTasks()}>重试</button><span>{error}</span></div> : null}
            {!loading && !error ? (
              <div className="dispatchTaskList">
                {tasks.slice(0, 12).map((task) => (
                  <div className={task.id === selectedTask?.id ? 'dispatchTaskItem selected' : 'dispatchTaskItem'} key={task.id}>
                    <button onClick={() => setSelectedTaskId(task.id)}>
                      <strong>{taskObjectiveLabel(task)}</strong>
                      <small>#{task.id} · {formatDate(task.updated_at)}</small>
                    </button>
                    <TaskActions task={task} onAction={runTaskAction} onReport={setReportTask} />
                  </div>
                ))}
                {tasks.length === 0 ? <EmptyState title="还没有任务" action="发布第一个任务" onAction={() => void publishTask()} /> : null}
              </div>
            ) : null}
          </section>

          <section className="inspectorPanel">
            <p className="eyebrow">TOOLS</p>
            <h2>工具调用</h2>
            {detailLoading ? <SkeletonRows /> : (
              <div className="toolCallList">
                {diagnostics.map((row) => (
                  <details key={row.label}>
                    <summary>{row.label}</summary>
                    <code>{row.value}</code>
                  </details>
                ))}
                {diagnostics.length === 0 ? <div className="emptyState">暂无工具诊断。</div> : null}
              </div>
            )}
          </section>

          <section className="inspectorPanel">
            <p className="eyebrow">LIVE LOG</p>
            <h2>执行日志</h2>
            <LogPreview compact>
              {logLines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}
              {logLines.length === 0 ? <span>暂无日志。</span> : null}
            </LogPreview>
          </section>

          {selectedTask ? (
            <footer className="dispatchStatusBar">
              <span>总耗时: {formatTaskDuration(selectedTask)}</span>
              <span>Token: {extractTaskUsage(selectedTaskDetail)}</span>
              <span>状态: {selectedTask.status}</span>
            </footer>
          ) : null}
        </aside>
      </section>

      {reportTask ? (
        <div className="modalBackdrop" onClick={() => setReportTask(null)}>
          <section className="modalPanel" onClick={(event) => event.stopPropagation()}>
            <div className="drawerHeader compactHeader">
              <div>
                <p className="eyebrow">TASK REPORT</p>
                <h2>{taskObjectiveLabel(reportTask)}</h2>
              </div>
              <button className="secondaryButton" onClick={() => setReportTask(null)}>关闭</button>
            </div>
            <LogPreview>
              <span>{extractResultSummary(reportTask.id === selectedTask?.id ? selectedTaskDetail : null)}</span>
            </LogPreview>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function DispatchNode({ node }: { node: ReturnType<typeof deriveDispatchGraph>['nodes'][number] }) {
  return (
    <div className={`flowNode ${node.role}FlowNode ${node.state}`}>
      <span>{node.role} · {node.state}</span>
      <strong>{node.label}</strong>
      <small>{node.caption}</small>
    </div>
  )
}

function FlowLine({ label }: { label: string }) {
  return (
    <div className="flowLine">
      <span>{label}</span>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="skeletonList">
      <span />
      <span />
      <span />
    </div>
  )
}

function EmptyState({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="emptyCta">
      <strong>{title}</strong>
      <span>任务创建后会在这里显示调度流程、工具调用和日志。</span>
      <button onClick={onAction}>{action}</button>
    </div>
  )
}

function TaskActions({
  task,
  onAction,
  onReport,
}: {
  task: TaskSummary
  onAction: (action: 'cancel' | 'retry' | 'reset', task: TaskSummary) => Promise<void>
  onReport: (task: TaskSummary) => void
}) {
  if (task.status === 'running' || task.status === 'queued') {
    return <button className="taskInlineAction dangerButton" onClick={() => void onAction('cancel', task)}>停止</button>
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    return <button className="taskInlineAction" onClick={() => void onAction('retry', task)}>重试</button>
  }
  if (task.status === 'completed') {
    return <button className="taskInlineAction" onClick={() => onReport(task)}>查看报告</button>
  }
  return <button className="taskInlineAction" onClick={() => void onAction('reset', task)}>重置</button>
}

function selectTaskType(config: AgentMeshConfig, office: Office): TaskType | undefined {
  return (office.default_task_type_id ? config.taskTypes?.[office.default_task_type_id] : undefined)
    ?? Object.values(config.taskTypes ?? {}).find((taskType) => taskType.enabled !== false)
}

function selectRoutingPolicy(config: AgentMeshConfig, office: Office): RoutingPolicy | undefined {
  return (office.default_routing_policy_id ? config.routingPolicies?.[office.default_routing_policy_id] : undefined)
    ?? Object.values(config.routingPolicies ?? {}).find((policy) => policy.office_id === office.id && policy.enabled !== false)
}

function selectExecutorMember(members: OfficeMember[], routingPolicy?: RoutingPolicy, taskType?: TaskType) {
  const enabledMembers = members.filter((member) => member.enabled !== false)
  const preferred = routingPolicy?.preferred_member_ids
    ?.map((memberId) => enabledMembers.find((member) => member.id === memberId))
    .find((member): member is OfficeMember => Boolean(member))
  if (preferred) return preferred

  const requiredCapabilities = [
    ...(routingPolicy?.required_capabilities ?? []),
    ...(taskType?.required_capabilities ?? []),
  ]
  if (requiredCapabilities.length > 0) {
    const matched = enabledMembers.find((member) => {
      const capabilities = member.persona?.capabilities ?? []
      return requiredCapabilities.some((capability) => capabilities.includes(capability))
    })
    if (matched) return matched
  }

  return enabledMembers.find((member) => member.id === routingPolicy?.fallback_member_id)
    ?? enabledMembers.find((member) => member.role === 'primary')
    ?? enabledMembers[0]
}
