import { useEffect, useState } from 'react'
import { EditableList, LogPreview, Panel, Status } from '../../components/common'
import { agentMeshApi } from '../../services/agentMeshApi'
import type { AgentMeshConfig, LogTail, Office, OfficeMember, RoutingPolicy, TaskType } from '../../types/agentMesh'
import { displayRoutingName } from '../../utils/displayNames'
import { extractResultSummary, formatDate, shortFileName } from '../../utils/taskDisplay'

export function ChatPage({ config, offices }: { config: AgentMeshConfig; offices: Office[] }) {
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? '')
  const selectedOffice = offices.find((office) => office.id === officeId) ?? offices[0]
  const members = selectedOffice?.members ?? []
  const taskTypes = Object.values(config.taskTypes ?? {}).filter((taskType) => taskType.enabled !== false)
  const officeRoutingPolicies = Object.values(config.routingPolicies ?? {}).filter((policy) => policy.office_id === selectedOffice?.id && policy.enabled !== false)
  const [taskTypeId, setTaskTypeId] = useState('')
  const [routingPolicyId, setRoutingPolicyId] = useState('')
  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [acceptanceText, setAcceptanceText] = useState('')
  const [constraintsText, setConstraintsText] = useState('')
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'failed'>('idle')
  const [dispatchState, setDispatchState] = useState<'idle' | 'dispatching' | 'dispatched' | 'failed'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdTaskDetail, setCreatedTaskDetail] = useState<Record<string, unknown> | null>(null)
  const [createdTaskLogs, setCreatedTaskLogs] = useState<LogTail[]>([])

  const selectedTaskType = taskTypes.find((taskType) => taskType.id === taskTypeId)
    ?? taskTypes.find((taskType) => taskType.id === selectedOffice?.default_task_type_id)
    ?? taskTypes[0]
  const selectedRoutingPolicy = officeRoutingPolicies.find((policy) => policy.id === routingPolicyId)
    ?? officeRoutingPolicies.find((policy) => policy.id === selectedOffice?.default_routing_policy_id)
    ?? officeRoutingPolicies[0]
  const selectedExecutor = selectExecutorMember(members, selectedRoutingPolicy, selectedTaskType)
  const canCreateTask = Boolean(selectedOffice && selectedTaskType && selectedRoutingPolicy && selectedExecutor && objective.trim())

  useEffect(() => {
    if (!officeId && offices[0]) setOfficeId(offices[0].id)
  }, [officeId, offices])

  useEffect(() => {
    if (selectedTaskType) {
      setTaskTypeId(selectedTaskType.id)
      setAcceptanceText((current) => current || (selectedTaskType.default_acceptance ?? []).join('\n'))
      setConstraintsText((current) => current || (selectedTaskType.default_constraints ?? []).join('\n'))
    }
    if (selectedRoutingPolicy) setRoutingPolicyId(selectedRoutingPolicy.id)
  }, [selectedRoutingPolicy, selectedTaskType])

  async function refreshCreatedTask(taskId = createdTaskId) {
    if (!taskId) return
    const [detail, logs] = await Promise.all([
      agentMeshApi.getTaskDetail(taskId),
      agentMeshApi.getTaskLogTail(taskId),
    ])
    setCreatedTaskDetail(detail)
    setCreatedTaskLogs(logs)
  }

  async function createTask() {
    if (!canCreateTask || !selectedOffice || !selectedTaskType || !selectedRoutingPolicy || !selectedExecutor) return
    setSubmitState('submitting')
    setDispatchState('idle')
    setSubmitError(null)
    setCreatedTaskId(null)
    setCreatedTaskDetail(null)
    setCreatedTaskLogs([])
    try {
      const result = await agentMeshApi.createChatTask({
        office_id: selectedOffice.id,
        task_type_id: selectedTaskType.id,
        routing_policy_id: selectedRoutingPolicy.id,
        assigned_member_id: selectedExecutor.id,
        objective: objective.trim(),
        context: context.trim(),
        acceptance: splitLines(acceptanceText),
        constraints: splitLines(constraintsText),
      })
      setCreatedTaskId(result.id)
      setSubmitState('idle')
    } catch (error) {
      setSubmitState('failed')
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }

  async function dispatchTask() {
    if (!createdTaskId) return
    setDispatchState('dispatching')
    setSubmitError(null)
    try {
      await agentMeshApi.dispatchChatTask(createdTaskId)
      setDispatchState('dispatched')
      await refreshCreatedTask(createdTaskId)
    } catch (error) {
      setDispatchState('failed')
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }

  function fillDemoTask() {
    setObjective('通过 test 办公室只读检查 agent-mesh 项目是做什么的，并总结项目定位、核心模块、当前能力边界和明显设计问题。')
    setContext([
      '展示目标：验证 Agent Mesh 能作为团队组织者，把任务交给办公室成员执行，并在任务页观察状态、日志和结果。',
      '工作目录：D:\\IDEA\\workspace\\agent-mesh',
      '权限：只读。',
    ].join('\n'))
    setAcceptanceText(['用简体中文说明项目用途。', '列出核心模块和当前能力。', '指出不合理的产品或工程设计。', '确认没有修改文件。'].join('\n'))
    setConstraintsText(['只读检查项目，不写入文件。', '不要执行会改变工作区状态的命令。', '不要访问凭据或敏感配置。'].join('\n'))
  }

  const createdTaskStatus = typeof createdTaskDetail?.status === 'string' ? createdTaskDetail.status : createdTaskId ? 'queued' : 'unknown'

  return (
    <div className="chatPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">LOCAL CHANNEL / AGENT MESH CHAT</p>
          <h1>Agent Mesh Chat</h1>
          <p>从本地 Channel 发起任务，按办公室 TaskType / RoutingPolicy 生成任务草稿并返回 task_id。</p>
        </div>
        <div className="actions">
          <button className="secondaryButton" onClick={fillDemoTask}>填入演示任务</button>
          <button disabled={!canCreateTask || submitState === 'submitting'} onClick={() => void createTask()}>
            {submitState === 'submitting' ? '创建中...' : '创建任务'}
          </button>
        </div>
      </header>

      {createdTaskId ? (
        <div className="saveNotice chatDispatchNotice">
          <span>任务已创建：#{createdTaskId}。确认后可手动派发给当前执行成员。</span>
          <button disabled={dispatchState === 'dispatching'} onClick={() => void dispatchTask()}>
            {dispatchState === 'dispatching' ? '派发中...' : '派发执行'}
          </button>
        </div>
      ) : null}
      {dispatchState === 'dispatched' ? <div className="saveNotice">任务已进入后台执行，可到任务页刷新查看事件、日志和结果。</div> : null}
      {submitState === 'failed' ? <div className="saveNotice error">{submitError ?? '创建失败'}</div> : null}

      <section className="chatWorkbench">
        <Panel title="任务输入">
          <div className="officeEditGrid compact">
            <label>
              <span>目标办公室</span>
              <select value={selectedOffice?.id ?? ''} onChange={(event) => {
                setOfficeId(event.target.value)
                setTaskTypeId('')
                setRoutingPolicyId('')
                setAcceptanceText('')
                setConstraintsText('')
              }}>
                {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
              </select>
            </label>
            <label>
              <span>任务目标</span>
              <textarea rows={5} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="写清楚要完成什么、边界是什么、希望如何验收。" />
            </label>
            <label>
              <span>上下文</span>
              <textarea rows={5} value={context} onChange={(event) => setContext(event.target.value)} placeholder="可以写相关文件、背景、约束来源、已有讨论。" />
            </label>
            <EditableList label="验收标准" value={acceptanceText} onChange={setAcceptanceText} />
            <EditableList label="约束" value={constraintsText} onChange={setConstraintsText} />
          </div>
        </Panel>

        <aside className="chatRoutingPanel">
          <Panel title="路由预览">
            <div className="officeEditGrid compact">
              <label>
                <span>任务类型</span>
                <select value={selectedTaskType?.id ?? ''} onChange={(event) => {
                  const next = taskTypes.find((taskType) => taskType.id === event.target.value)
                  setTaskTypeId(event.target.value)
                  setAcceptanceText((next?.default_acceptance ?? []).join('\n'))
                  setConstraintsText((next?.default_constraints ?? []).join('\n'))
                }}>
                  {taskTypes.map((taskType) => <option key={taskType.id} value={taskType.id}>{taskType.name}</option>)}
                </select>
              </label>
              <label>
                <span>路由策略</span>
                <select value={selectedRoutingPolicy?.id ?? ''} onChange={(event) => setRoutingPolicyId(event.target.value)}>
                  {officeRoutingPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
                </select>
              </label>
            </div>
            <div className="routingPreview">
              <strong>执行成员</strong>
              <span>{selectedExecutor ? `${selectedExecutor.office_title} / ${selectedExecutor.persona?.name ?? selectedExecutor.persona_id}` : '未匹配到成员'}</span>
              <strong>路由算法</strong>
              <span>{displayRoutingName(selectedRoutingPolicy?.strategy)}</span>
              <strong>任务能力</strong>
              <span>{(selectedTaskType?.required_capabilities ?? []).join(' / ') || '-'}</span>
            </div>
          </Panel>
          {createdTaskId ? (
            <Panel title="任务回执">
              <div className="chatTaskReceipt">
                <div className="drawerHeader compactHeader">
                  <div>
                    <strong className="monoText">#{createdTaskId}</strong>
                    <small>Updated: {formatDate(typeof createdTaskDetail?.updated_at === 'string' ? createdTaskDetail.updated_at : undefined)}</small>
                  </div>
                  <Status value={createdTaskStatus} label={createdTaskStatus} />
                </div>
                <div className="drawerSection compactSection">
                  <h3>结果摘要</h3>
                  <LogPreview compact><span>{extractResultSummary(createdTaskDetail)}</span></LogPreview>
                </div>
                <div className="drawerSection compactSection">
                  <h3>最近日志</h3>
                  <LogPreview compact>
                    {createdTaskLogs.flatMap((log) => log.lines.map((line) => `${shortFileName(log.path)} ${line}`)).slice(-18).map((line, index) => (
                      <span key={`${index}-${line}`}>{line}</span>
                    ))}
                    {createdTaskLogs.length === 0 ? <span>暂无日志。</span> : null}
                  </LogPreview>
                </div>
                <button className="secondaryButton" onClick={() => void refreshCreatedTask()}>刷新任务状态</button>
              </div>
            </Panel>
          ) : null}
        </aside>
      </section>
    </div>
  )
}

function selectExecutorMember(members: OfficeMember[], routingPolicy?: RoutingPolicy, taskType?: TaskType) {
  const enabledMembers = members.filter((member) => member.enabled !== false)
  const preferred = routingPolicy?.preferred_member_ids
    ?.map((memberId) => enabledMembers.find((member) => member.id === memberId))
    .find((member): member is OfficeMember => Boolean(member))
  if (preferred) return preferred

  const requiredCapabilities = [...(routingPolicy?.required_capabilities ?? []), ...(taskType?.required_capabilities ?? [])]
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

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}
