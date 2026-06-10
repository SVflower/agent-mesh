import { useEffect, useMemo, useState } from 'react'
import { AgentLogo, Status } from '../../components/common'
import type { RuntimeScanState } from '../../hooks/useAgentMeshBootstrap'
import { agentMeshApi } from '../../services/agentMeshApi'
import type { Office, Persona, RuntimeAsset, RuntimeKind, TaskSummary } from '../../types/agentMesh'
import { displayPermissionName, displayRuntimeName } from '../../utils/displayNames'
import { formatDate, taskObjectiveLabel } from '../../utils/taskDisplay'

const runtimeKinds: RuntimeKind[] = ['hermes', 'codex', 'claude-code', 'openclaw']

export function DashboardPage({
  offices,
  personas,
  runtimeAssets,
  scanError,
  scanState,
  onCreateOffice,
  onNewTask,
  onRescan,
}: {
  offices: Office[]
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  scanError: string | null
  scanState: RuntimeScanState
  onCreateOffice: () => void
  onNewTask: () => void
  onRescan: () => void
}) {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [taskState, setTaskState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    setTaskState('loading')
    void agentMeshApi.listTasks()
      .then((next) => {
        setTasks(next)
        setTaskState('ready')
      })
      .catch(() => {
        setTasks([])
        setTaskState('failed')
      })
  }, [])

  const runtimeCards = useMemo(() => runtimeKinds.map((kind) => {
    const runtime = runtimeAssets.find((item) => item.kind === kind)
    const runtimePersonas = personas.filter((persona) => {
      const runtimeId = persona.runtime_id.toLowerCase()
      return persona.runtime?.kind === kind || runtimeId.includes(kind.replace('-code', '')) || runtimeId.includes(kind)
    })
    return {
      kind,
      name: runtime?.name ?? displayRuntimeName(kind),
      personas: runtimePersonas.length,
      status: runtime?.installed ? 'available' : 'missing',
      version: runtime?.version ?? (runtime?.installed ? 'detected' : 'not found'),
    }
  }), [personas, runtimeAssets])

  const detectedCount = runtimeCards.filter((runtime) => runtime.status === 'available').length
  const scanLabel = scanState === 'scanning' ? '扫描中...' : scanState === 'failed' ? '扫描异常' : `${detectedCount}/4 已检测`
  const scanValue = scanState === 'failed' ? 'failed' : scanState === 'scanning' ? 'running' : 'available'

  return (
    <div className="dashboardPage">
      <section className="heroBand">
        <div>
          <p className="eyebrow">AGENT MESH CONTROL ROOM</p>
          <h1>本地 AI Agent 团队协作可视化</h1>
          <p>把 Hermes、Codex、Claude Code、OpenClaw 组织成办公室，让主 Agent 负责沟通、分派和汇总。</p>
        </div>
        <div className="heroActions">
          <button onClick={onCreateOffice}>创建办公室</button>
          <button className="secondaryButton" onClick={onNewTask}>新建任务</button>
        </div>
      </section>

      <section className="dashboardGrid">
        <div className="dashboardMain">
          <section className="meshPanel">
            <div className="panelTitleRow">
              <div>
                <p className="eyebrow">RUNTIMES</p>
                <h2>Agent 资产概览</h2>
              </div>
              <button className="statusButton" onClick={onRescan}>
                <Status value={scanValue} label={scanLabel} />
              </button>
            </div>
            {scanError ? <div className="errorNotice compact"><strong>扫描失败</strong><button onClick={onRescan}>重试</button><span>{scanError}</span></div> : null}
            {scanState === 'scanning' && runtimeAssets.length === 0 ? <SkeletonGrid /> : (
              <div className="runtimeCardGrid">
                {runtimeCards.map((runtime) => (
                  <article className="runtimeAssetCard" key={runtime.kind}>
                    <div className="runtimeAssetTop">
                      <AgentLogo kind={runtime.kind} />
                      <Status value={runtime.status} label={runtime.status === 'available' ? '已安装' : '未安装'} />
                    </div>
                    <h3>{runtime.name}</h3>
                    <p>{runtime.personas} 个 Persona 已检测</p>
                    <div className="runtimeAssetMeta">
                      <span>{runtime.version}</span>
                      <i className={runtime.status === 'available' ? 'healthDot ok' : 'healthDot warn'} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="meshPanel">
            <div className="panelTitleRow">
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>最近任务动态</h2>
              </div>
            </div>
            {taskState === 'loading' ? <SkeletonRows /> : null}
            {taskState === 'failed' ? <div className="errorNotice compact"><strong>任务加载失败</strong><span>请稍后重试。</span></div> : null}
            {taskState === 'ready' ? (
              <div className="timelineList">
                {tasks.slice(0, 5).map((task) => (
                  <div className="timelineItem" key={task.id}>
                    <span className={`timelinePulse ${task.status}`} />
                    <div>
                      <strong>{taskObjectiveLabel(task)}</strong>
                      <small>{task.agent} · {formatDate(task.updated_at)}</small>
                    </div>
                    <Status value={task.status} label={task.status} />
                  </div>
                ))}
                {tasks.length === 0 ? <div className="emptyState">还没有任务记录。</div> : null}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="dashboardSide">
          <section className="meshPanel">
            <div className="panelTitleRow">
              <div>
                <p className="eyebrow">OFFICES</p>
                <h2>活跃办公室</h2>
              </div>
            </div>
            <div className="officeStack">
              {offices.map((office) => (
                <article className="officeMiniCard" key={office.id}>
                  <div>
                    <strong>{office.name}</strong>
                    <small>{office.members?.length ?? 0} members · {displayPermissionName(office.default_permission_policy_id)}</small>
                  </div>
                  <div className="avatarStack">
                    {(office.members ?? []).slice(0, 4).map((member) => (
                      <span key={member.id}>{(member.persona?.name ?? member.persona_id).slice(0, 1).toUpperCase()}</span>
                    ))}
                  </div>
                </article>
              ))}
              {offices.length === 0 ? <div className="emptyCta"><strong>还没有办公室</strong><span>先创建一个团队，再把任务交给主 Agent。</span><button onClick={onCreateOffice}>创建办公室</button></div> : null}
            </div>
          </section>

          <section className="meshPanel commandPanel">
            <p className="eyebrow">NEXT</p>
            <h2>推荐动作</h2>
            <button onClick={onCreateOffice}>AI 自动配置办公室</button>
            <button className="secondaryButton" onClick={onNewTask}>发布只读检查任务</button>
          </section>
        </aside>
      </section>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="runtimeCardGrid">
      {[0, 1, 2, 3].map((item) => <div className="skeletonCard" key={item} />)}
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
