import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import { AgentLogo, Status } from '../../components/common'
import type { RuntimeScanState } from '../../hooks/useAgentMeshBootstrap'
import { agentMeshApi } from '../../services/agentMeshApi'
import type { AgentMeshConfig, Channel, Office, OfficeMember, PermissionMode, Persona, RuntimeAsset, RuntimeKind, RoutingPolicy, TaskType } from '../../types/agentMesh'
import { displayChannelName, displayPermissionName, displayRoutingName } from '../../utils/displayNames'
import { formatDate } from '../../utils/taskDisplay'

type PageId = 'dashboard' | 'offices' | 'office-create' | 'office-detail' | 'agents' | 'tasks' | 'chat' | 'settings'
type Translator = (key: string) => string

type OfficeDraft = {
  name: string
  description: string
  primaryPersonaId: string
  collaboratorPersonaIds: string[]
  permissionMode: PermissionMode
  channelType: 'agent-mesh-chat' | 'none'
}

export function OfficesPage({
  offices,
  personas,
  runtimeAssets,
  scanState,
  onCreateOffice,
  onOpenOffice,
}: {
  offices: Office[]
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  scanState: RuntimeScanState
  onCreateOffice: () => void
  onOpenOffice: (officeId: string) => void
  t: Translator
}) {
  const detectedCount = runtimeAssets.filter((runtime) => runtime.installed).length

  return (
    <div className="officePage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">OFFICES</p>
          <h1>办公室管理</h1>
          <p>办公室是 Agent Mesh 的团队单位：主 Agent 对接用户，协作 Agent 负责执行和回传。</p>
        </div>
        <button onClick={onCreateOffice}>创建办公室</button>
      </header>

      <section className="officeManagementGrid">
        <aside className="officeListPane">
          <div className="officeListHeader">
            <strong>办公室列表</strong>
            <Status value={scanState === 'scanning' ? 'running' : 'available'} label={`${detectedCount}/4 Runtime · ${personas.length} Persona`} />
          </div>
          <div className="officeTreeList">
            {offices.map((office) => (
              <button className="officeTreeItem" key={office.id} onClick={() => onOpenOffice(office.id)}>
                <span className="officeGlyph">O</span>
                <div>
                  <strong>{office.name}</strong>
                  <small>{office.members?.length ?? 0} members · {office.default_workspace_path ?? '.'}</small>
                </div>
              </button>
            ))}
            {offices.length === 0 ? <div className="emptyCta"><strong>还没有办公室</strong><span>创建办公室后才能把任务交给主 Agent 调度。</span><button onClick={onCreateOffice}>创建办公室</button></div> : null}
          </div>
        </aside>

        <section className="officeGallery">
          {offices.map((office) => {
            const members = office.members ?? []
            const primary = members.find((member) => member.role === 'primary') ?? members[0]
            return (
              <article className="officeShowCard" key={office.id}>
                <div className="officeShowHead">
                  <div>
                    <p className="eyebrow">ACTIVE OFFICE</p>
                    <h2>{office.name}</h2>
                    <span>{office.description || '本地 Agent 团队'}</span>
                  </div>
                  <Status value={office.paused ? 'standby' : 'online'} label={office.paused ? '暂停' : '在线'} />
                </div>

                <OfficeOrbit members={members} primary={primary} />

                <div className="officePolicyStrip">
                  <Metric label="Channel" value={displayChannelName(office.default_channel_id)} raw={office.default_channel_id} />
                  <Metric label="Permission" value={displayPermissionName(office.default_permission_policy_id)} raw={office.default_permission_policy_id} />
                  <Metric label="Routing" value={displayRoutingName(office.default_routing_policy_id)} raw={office.default_routing_policy_id} />
                </div>
                <button className="secondaryButton" onClick={() => onOpenOffice(office.id)}>查看详情</button>
              </article>
            )
          })}
        </section>
      </section>
    </div>
  )
}

export function OfficeDetailPage({
  config,
  office,
  onBack,
}: {
  config: AgentMeshConfig
  office?: Office
  onBack: () => void
  onConfigSaved: () => Promise<void>
  t: Translator
}) {
  if (!office) {
    return <div className="officePage"><div className="emptyState">尚未选择办公室。</div></div>
  }

  const members = office.members ?? []
  const primary = members.find((member) => member.role === 'primary') ?? members[0]
  const policy = office.default_permission_policy_id ? config.permissionPolicies?.[office.default_permission_policy_id] : undefined
  const routing = office.default_routing_policy_id ? config.routingPolicies?.[office.default_routing_policy_id] : undefined

  return (
    <div className="officePage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">OFFICE DETAIL</p>
          <h1>{office.name}</h1>
          <p>{office.description || '本地 Agent 团队'}</p>
        </div>
        <button className="secondaryButton" onClick={onBack}>返回</button>
      </header>

      <section className="officeDetailShowcase">
        <div className="officeHeroPanel">
          <OfficeOrbit members={members} primary={primary} large />
        </div>
        <aside className="officeInspector">
          <Metric label="状态" value={office.paused ? '暂停' : '在线'} />
          <Metric label="创建时间" value={formatDate(office.created_at)} />
          <Metric label="默认工作目录" value={office.default_workspace_path ?? '.'} />
          <Metric label="Channel" value={displayChannelName(office.default_channel_id)} raw={office.default_channel_id} />
          <div className="permissionRail">
            <span className={policy?.default_mode === 'read-only' ? 'active' : ''}>只读</span>
            <span className={policy?.default_mode === 'safe-write' ? 'active' : ''}>安全写入</span>
            <span className={policy?.default_mode === 'full-access' ? 'active' : ''}>完全访问</span>
          </div>
          <Metric label="路由策略" value={displayRoutingName(routing?.strategy ?? office.default_routing_policy_id)} raw={office.default_routing_policy_id} />
        </aside>
      </section>
    </div>
  )
}

export function OfficeCreatePage({
  officeDraft,
  personas,
  runtimeAssets,
  setActivePage,
  setOfficeDraft,
  onSaved,
}: {
  officeDraft: OfficeDraft
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  setActivePage: Dispatch<SetStateAction<PageId>>
  setOfficeDraft: Dispatch<SetStateAction<OfficeDraft>>
  onSaved: () => Promise<void>
  t: Translator
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enabledPersonas = personas.filter((persona) => persona.enabled !== false)
  const primaryPersona = enabledPersonas.find((persona) => persona.id === officeDraft.primaryPersonaId) ?? enabledPersonas[0]
  const collaborators = officeDraft.collaboratorPersonaIds
    .map((id) => enabledPersonas.find((persona) => persona.id === id))
    .filter((persona): persona is Persona => Boolean(persona))
  const recommended = useMemo(() => enabledPersonas.find((persona) => persona.runtime_id.includes('hermes')) ?? enabledPersonas[0], [enabledPersonas])
  const steps = ['智能扫描', '一键组队', '确认启动']
  const scanComplete = runtimeAssets.length > 0 && runtimeAssets.some((runtime) => runtime.installed)
  const captainSelected = Boolean(officeDraft.primaryPersonaId || primaryPersona)
  const canCreate = scanComplete && captainSelected && !saving

  function updateDraft(patch: Partial<OfficeDraft>) {
    setOfficeDraft((current) => ({ ...current, ...patch }))
  }

  function canOpenStep(index: number) {
    if (index === 0) return true
    if (index === 1) return scanComplete
    return scanComplete && captainSelected
  }

  function nextStep() {
    if (stepIndex === 0 && !scanComplete) return
    if (stepIndex === 1 && !captainSelected) return
    setStepIndex((current) => Math.min(steps.length - 1, current + 1))
  }

  function toggleCollaborator(personaId: string) {
    setOfficeDraft((current) => {
      const next = current.collaboratorPersonaIds.includes(personaId)
        ? current.collaboratorPersonaIds.filter((id) => id !== personaId)
        : [...current.collaboratorPersonaIds, personaId]
      return { ...current, collaboratorPersonaIds: next.filter((id) => id !== current.primaryPersonaId) }
    })
  }

  function autoConfigure() {
    const captain = recommended
    const nextCollaborators = enabledPersonas.filter((persona) => persona.id !== captain?.id).slice(0, 3)
    setOfficeDraft((current) => ({
      ...current,
      name: current.name || 'AI 协作办公室',
      description: current.description || '由 Agent Mesh 自动配置的本地 Agent 团队。',
      primaryPersonaId: captain?.id ?? '',
      collaboratorPersonaIds: nextCollaborators.map((persona) => persona.id),
      permissionMode: 'read-only',
      channelType: 'agent-mesh-chat',
    }))
  }

  async function createOffice() {
    const captain = primaryPersona
    if (!captain || !canCreate) return

    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const officeId = `office_${slugify(officeDraft.name || 'office')}_${Date.now()}`
      const primaryMemberId = `${officeId}_primary`
      const members: OfficeMember[] = [
        {
          id: primaryMemberId,
          office_id: officeId,
          persona_id: captain.id,
          role: 'primary',
          office_title: 'Captain / 主 Agent',
          responsibility: '接收用户任务，拆解、路由、汇总团队结果。',
          enabled: true,
        },
        ...collaborators.map((persona, index): OfficeMember => ({
          id: `${officeId}_member_${index + 1}`,
          office_id: officeId,
          persona_id: persona.id,
          role: 'collaborator',
          office_title: '协作 Agent',
          responsibility: persona.description ?? '执行办公室分配的协作任务。',
          enabled: true,
        })),
      ]
      const channel: Channel = {
        id: `${officeId}_channel_chat`,
        type: officeDraft.channelType,
        name: 'Agent Mesh Chat',
        office_id: officeId,
        primary_member_id: primaryMemberId,
        permission_policy_id: permissionPolicyId(officeDraft.permissionMode),
        enabled: officeDraft.channelType !== 'none',
      }
      const taskType: TaskType = {
        id: `task_type_${officeId}_default`,
        name: officeDraft.permissionMode === 'read-only' ? '只读项目检查' : '默认协作任务',
        description: '从统一入口创建的可观测办公室任务。',
        required_capabilities: officeDraft.permissionMode === 'read-only' ? ['repo.inspect'] : [],
        default_acceptance: ['说明执行结论', '列出关键发现', '标明风险和后续建议'],
        default_constraints: officeDraft.permissionMode === 'read-only' ? ['只读检查，不修改文件'] : ['遵守办公室权限策略'],
        enabled: true,
      }
      const routingPolicy: RoutingPolicy = {
        id: `routing_${officeId}_default`,
        name: 'AI 推荐路由',
        office_id: officeId,
        task_type_id: taskType.id,
        strategy: 'capability-match',
        preferred_member_ids: members.filter((member) => member.role !== 'primary').map((member) => member.id),
        fallback_member_id: members.find((member) => member.role !== 'primary')?.id ?? primaryMemberId,
        required_capabilities: taskType.required_capabilities,
        enabled: true,
      }

      await agentMeshApi.saveOffice({
        office: {
          id: officeId,
          name: officeDraft.name.trim() || 'AI 协作办公室',
          description: officeDraft.description.trim(),
          default_permission_policy_id: channel.permission_policy_id,
          default_channel_id: channel.id,
          default_task_type_id: taskType.id,
          default_routing_policy_id: routingPolicy.id,
          default_workspace_path: '.',
          paused: false,
          created_at: now,
          updated_at: now,
        },
        members,
        channel,
        taskType,
        routingPolicy,
      })
      await onSaved()
      setActivePage('offices')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="officeCreatePage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">CREATE OFFICE</p>
          <h1>办公室创建向导</h1>
          <p>自动扫描 Agent，推荐主 Agent，一键生成权限、通道和路由策略。</p>
        </div>
        <button className="secondaryButton" onClick={() => setActivePage('offices')}>取消</button>
      </header>

      <div className="createStepper">
        {steps.map((step, index) => (
          <button
            className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''}
            disabled={!canOpenStep(index)}
            key={step}
            onClick={() => canOpenStep(index) && setStepIndex(index)}
          >
            <span>{index + 1}</span>
            {step}
          </button>
        ))}
      </div>

      {stepIndex === 0 ? (
        <section className="scanStage">
          <div className={`radarCanvas ${scanComplete ? 'scanComplete' : ''}`}>
            <div className="radarSweep" />
            <strong>{runtimeAssets.filter((runtime) => runtime.installed).length}</strong>
            <small>已发现 Runtime</small>
            <div className="scanProgressLine">
              {(['hermes', 'codex', 'claude-code', 'openclaw'] as RuntimeKind[]).map((kind) => {
                const runtime = runtimeAssets.find((item) => item.kind === kind)
                return <span key={kind}>{runtimeLabel(kind)} {runtime?.installed ? '✓' : '✗'}</span>
              })}
            </div>
          </div>
          <div className="runtimeCardGrid">
            {runtimeAssets.map((runtime) => (
              <article className="runtimeAssetCard flyInAgent" key={runtime.id}>
                <div className="runtimeAssetTop">
                  <AgentLogo kind={runtime.kind} />
                  <Status value={runtime.installed ? 'available' : 'missing'} label={runtime.installed ? '已安装' : '未安装'} />
                </div>
                <h3>{runtime.name}</h3>
                <p>{personas.filter((persona) => persona.runtime_id === runtime.id).length} 个 Persona</p>
              </article>
            ))}
            {runtimeAssets.length === 0 ? <div className="emptyState">正在等待扫描结果。</div> : null}
          </div>
        </section>
      ) : null}

      {stepIndex === 1 ? (
        <section className="composeStage">
          <div className="officeCanvas">
            <div className="captainNode">
              <AgentLogo kind={runtimeKindOf(primaryPersona)} />
              <strong>{primaryPersona?.name ?? '选择主 Agent'}</strong>
              <small>Captain</small>
            </div>
            {collaborators.map((persona, index) => (
              <div className="orbitMember" style={orbitStyle(index, collaborators.length)} key={persona.id}>
                <AgentLogo kind={runtimeKindOf(persona)} compact />
                <span>{persona.name}</span>
              </div>
            ))}
          </div>
          <aside className="composePanel">
            <button onClick={autoConfigure}>AI 自动配置</button>
            <label>
              <span>办公室名称</span>
              <input value={officeDraft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>
            <label>
              <span>描述</span>
              <input value={officeDraft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
            </label>
            <label>
              <span>主 Agent</span>
              <select value={officeDraft.primaryPersonaId || primaryPersona?.id || ''} onChange={(event) => updateDraft({ primaryPersonaId: event.target.value, collaboratorPersonaIds: officeDraft.collaboratorPersonaIds.filter((id) => id !== event.target.value) })}>
                {enabledPersonas.map((persona) => <option key={persona.id} value={persona.id}>{persona.runtime?.name ?? persona.runtime_id} / {persona.name}</option>)}
              </select>
            </label>
            <div className="segmented permissionSelector">
              {(['read-only', 'safe-write', 'full-access'] as PermissionMode[]).map((mode) => (
                <button className={officeDraft.permissionMode === mode ? 'selected' : ''} key={mode} onClick={() => updateDraft({ permissionMode: mode })}>
                  {displayPermissionName(mode)}
                </button>
              ))}
            </div>
            <div className="personaPickGrid">
              {enabledPersonas.filter((persona) => persona.id !== officeDraft.primaryPersonaId).map((persona) => (
                <button className={officeDraft.collaboratorPersonaIds.includes(persona.id) ? 'selected' : ''} key={persona.id} onClick={() => toggleCollaborator(persona.id)}>
                  <AgentLogo kind={runtimeKindOf(persona)} compact />
                  <span>{persona.name}</span>
                </button>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      {stepIndex === 2 ? (
        <section className="confirmStage">
          <article className="officePreviewBig">
            <p className="eyebrow">READY TO LAUNCH</p>
            <h2>{officeDraft.name || 'AI 协作办公室'}</h2>
            <p>{officeDraft.description || '由 Agent Mesh 自动生成的本地 Agent 办公室。'}</p>
            <div className="officePolicyStrip">
              <Metric label="Captain" value={primaryPersona?.name ?? '-'} />
              <Metric label="Members" value={String(collaborators.length)} />
              <Metric label="Permission" value={displayPermissionName(officeDraft.permissionMode)} />
              <Metric label="Channel" value="Agent Mesh Chat" />
            </div>
            {error ? <div className="errorNotice compact"><strong>创建失败</strong><span>{error}</span></div> : null}
            <button disabled={!canCreate} title={!scanComplete ? '请先完成扫描' : !captainSelected ? '请选择主 Agent' : ''} onClick={() => void createOffice()}>
              {saving ? '创建中...' : '创建并启动'}
            </button>
          </article>
        </section>
      ) : null}

      <footer className="wizardFooterBar">
        <button className="secondaryButton" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>上一步</button>
        {stepIndex === steps.length - 1 ? (
          <button disabled={!canCreate} onClick={() => void createOffice()}>{saving ? '创建中...' : '创建并启动'}</button>
        ) : (
          <button disabled={!canOpenStep(stepIndex + 1)} onClick={nextStep}>下一步</button>
        )}
      </footer>
    </div>
  )
}

function OfficeOrbit({ members, primary, large = false }: { members: OfficeMember[]; primary?: OfficeMember; large?: boolean }) {
  const workers = members.filter((member) => member.id !== primary?.id)
  const visibleWorkers = workers.slice(0, 6)
  const overflow = Math.max(0, workers.length - visibleWorkers.length)

  return (
    <div className={large ? 'officeOrbit large' : 'officeOrbit'}>
      <div className="captainNode">
        <AgentLogo kind={runtimeKindOfMember(primary)} />
        <strong>{primary?.persona?.name ?? 'Captain'}</strong>
        <small>主控</small>
      </div>
      {visibleWorkers.map((member, index) => (
        <div className="orbitMember" style={orbitStyle(index, visibleWorkers.length)} key={member.id} title={`${member.office_title}: ${member.responsibility ?? ''}`}>
          <AgentLogo kind={runtimeKindOfMember(member)} compact />
          <span>{member.persona?.name ?? member.persona_id}</span>
        </div>
      ))}
      {overflow > 0 ? <div className="orbitOverflow">+{overflow}</div> : null}
    </div>
  )
}

function Metric({ label, value, raw }: { label: string; value: string; raw?: string }) {
  return (
    <div className="metricTile" title={raw}>
      <small>{label}</small>
      <strong>{value}</strong>
      {raw && raw !== value ? <span className="debugId">{raw}</span> : null}
    </div>
  )
}

function orbitStyle(index: number, count: number) {
  const total = count <= 3 ? Math.max(count, 3) : Math.min(count, 6)
  const angle = -90 + (360 / total) * index
  const radius = count <= 3 ? 35 : 39
  return {
    left: `${50 + Math.cos((angle * Math.PI) / 180) * radius}%`,
    top: `${50 + Math.sin((angle * Math.PI) / 180) * radius}%`,
    transform: 'translate(-50%, -50%)',
  }
}

function permissionPolicyId(mode: PermissionMode) {
  if (mode === 'read-only') return 'policy_local_readonly'
  if (mode === 'full-access') return 'policy_local_full_access'
  return 'policy_local_safe_dev'
}

function runtimeKindOf(persona?: Persona): RuntimeKind {
  if (!persona) return 'hermes'
  if (persona.runtime?.kind) return persona.runtime.kind
  if (persona.runtime_id.includes('openclaw')) return 'openclaw'
  if (persona.runtime_id.includes('codex')) return 'codex'
  if (persona.runtime_id.includes('claude')) return 'claude-code'
  return 'hermes'
}

function runtimeKindOfMember(member?: OfficeMember): RuntimeKind {
  return runtimeKindOf(member?.persona)
}

function runtimeLabel(kind: RuntimeKind) {
  if (kind === 'claude-code') return 'Claude Code'
  if (kind === 'openclaw') return 'OpenClaw'
  return kind[0].toUpperCase() + kind.slice(1)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '') || 'office'
}
