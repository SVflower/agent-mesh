import './App.css'
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from 'react'
import { useAgentMeshBootstrap, type RuntimeScanState } from './hooks/useAgentMeshBootstrap'
import { type Locale, useI18n } from './i18n'
import { agentMeshApi } from './services/agentMeshApi'
import type {
  AdapterCapabilityState,
  AgentMeshConfig,
  Channel,
  LogTail,
  Office,
  OfficeMember,
  PermissionMode,
  PermissionPolicy,
  Persona,
  RoutingPolicy,
  RuntimeAdapterStatus,
  RuntimeAsset,
  RuntimeKind,
  RuntimeStatus,
  TaskSessionStatus,
  TaskSummary,
  TaskType,
} from './types/agentMesh'

type PageId = 'offices' | 'office-create' | 'office-detail' | 'agents' | 'tasks' | 'chat' | 'settings'
type ThemeMode = 'light' | 'dark' | 'system'
type Translator = (key: string) => string

type OfficeDraft = {
  name: string
  description: string
  primaryPersonaId: string
  collaboratorPersonaIds: string[]
  permissionMode: PermissionMode
}

type PersonaDraft = {
  runtimeId: string
  name: string
  profileKey: string
  description: string
  capabilities: string
  skills: string
  mcpBindings: string
}

const runtimeCatalog: Record<RuntimeKind, {
  name: string
  fallback: string
  logoUrl: string
  officialSite: string
  command: string
}> = {
  hermes: {
    name: 'Hermes',
    fallback: 'HM',
    logoUrl: 'https://hermes-agent.nousresearch.com/favicon.ico',
    officialSite: 'https://hermes-agent.nousresearch.com/docs/',
    command: 'hermes',
  },
  openclaw: {
    name: 'OpenClaw',
    fallback: 'OC',
    logoUrl: 'https://openclaw.ai/favicon.ico',
    officialSite: 'https://openclaw.ai',
    command: 'openclaw',
  },
  'claude-code': {
    name: 'Claude Code',
    fallback: 'CC',
    logoUrl: 'https://www.claude.com/favicon.ico',
    officialSite: 'https://www.claude.com/product/claude-code',
    command: 'claude',
  },
  codex: {
    name: 'Codex',
    fallback: 'CX',
    logoUrl: 'https://openai.com/favicon.ico',
    officialSite: 'https://openai.com/codex/',
    command: 'codex',
  },
}

const navItems: Array<[Extract<PageId, 'offices' | 'agents' | 'tasks' | 'chat'>, string]> = [
  ['offices', 'nav.offices'],
  ['agents', 'nav.agents'],
  ['tasks', 'nav.tasks'],
  ['chat', 'nav.chat'],
]

const defaultHomeAgents: RuntimeKind[] = ['hermes', 'openclaw', 'claude-code', 'codex']

function App() {
  const { locale, setLocale, t } = useI18n()
  const [activePage, setActivePage] = useState<PageId>('offices')
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [selectedHomeAgents, setSelectedHomeAgents] = useState<RuntimeKind[]>(defaultHomeAgents)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const {
    adapterStatuses,
    config,
    offices,
    personas,
    refreshConfig,
    rescanRuntimes,
    runtimeAssets,
    scanError,
    scanState,
  } = useAgentMeshBootstrap()

  const defaultOfficeDraft = useMemo<OfficeDraft>(() => ({
    name: '本地开发办公室',
    description: '用于本机代码、文档和长任务协作的办公室。',
    primaryPersonaId: personas.find((persona) => persona.id === 'persona_hermes_feishu_primary')?.id ?? personas[0]?.id ?? '',
    collaboratorPersonaIds: personas
      .filter((persona) => ['persona_claude_code_default', 'persona_codex_default'].includes(persona.id))
      .map((persona) => persona.id),
    permissionMode: 'safe-write',
  }), [personas])
  const [officeDraft, setOfficeDraft] = useState<OfficeDraft>(defaultOfficeDraft)

  useEffect(() => {
    setOfficeDraft(defaultOfficeDraft)
  }, [defaultOfficeDraft])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark"><OfficeIcon /></span>
          <div>
            <strong>{t('app.title')}</strong>
            <small>{t('app.subtitle')}</small>
          </div>
        </div>
        <nav>
          {navItems.map(([key, labelKey]) => (
            <button
              className={key === activePage || (key === 'offices' && (activePage === 'office-create' || activePage === 'office-detail')) ? 'active' : ''}
              key={key}
              onClick={() => setActivePage(key)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <button
          className={activePage === 'settings' ? 'settingsButton active' : 'settingsButton'}
          onClick={() => setActivePage('settings')}
          title={t('nav.settings')}
        >
          <SettingsIcon />
          <span>{t('nav.settings')}</span>
        </button>
      </aside>

      <main className="main">
        {activePage === 'settings' ? (
          <SettingsPage
            locale={locale}
            selectedHomeAgents={selectedHomeAgents}
            setLocale={setLocale}
            setSelectedHomeAgents={setSelectedHomeAgents}
            setTheme={setTheme}
            t={t}
            theme={theme}
          />
        ) : activePage === 'agents' ? (
          <AgentsPage
            config={config}
            adapterStatuses={adapterStatuses}
            personas={personas}
            runtimeAssets={runtimeAssets}
            scanError={scanError}
            scanState={scanState}
            onConfigSaved={refreshConfig}
            onRescan={rescanRuntimes}
            t={t}
          />
        ) : activePage === 'tasks' ? (
          <TasksPage t={t} />
        ) : activePage === 'chat' ? (
          <ChatPage config={config} offices={offices} />
        ) : activePage === 'office-create' ? (
          <OfficeCreatePage
            officeDraft={officeDraft}
            personas={personas}
            runtimeAssets={runtimeAssets}
            setActivePage={setActivePage}
            setOfficeDraft={setOfficeDraft}
            onSaved={refreshConfig}
            t={t}
          />
        ) : activePage === 'office-detail' ? (
          <OfficeDetailPage
            config={config}
            office={offices.find((office) => office.id === selectedOfficeId) ?? offices[0]}
            onBack={() => setActivePage('offices')}
            onConfigSaved={refreshConfig}
            t={t}
          />
        ) : (
          <OfficesPage
            offices={offices}
            personas={personas}
            runtimeAssets={runtimeAssets}
            scanState={scanState}
            onCreateOffice={() => setActivePage('office-create')}
            onOpenOffice={(officeId) => {
              setSelectedOfficeId(officeId)
              setActivePage('office-detail')
            }}
            onRescan={rescanRuntimes}
            t={t}
          />
        )}
      </main>
    </div>
  )
}

function OfficesPage({
  offices,
  personas,
  runtimeAssets,
  scanState,
  onCreateOffice,
  onOpenOffice,
  onRescan,
  t,
}: {
  offices: Office[]
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  scanState: RuntimeScanState
  onCreateOffice: () => void
  onOpenOffice: (officeId: string) => void
  onRescan: () => void
  t: Translator
}) {
  const detectedCount = runtimeAssets.filter((runtime) => runtime.installed).length

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{t('offices.title')}</h1>
          <p>办公室是用户手动组建的 Agent 团体，至少由一个主 Persona 和一个协作 Persona 组成。</p>
        </div>
        <div className="actions">
          <button disabled={scanState === 'scanning'} onClick={onRescan}>
            {scanState === 'scanning' ? t('actions.scanning') : t('actions.rescanBackground')}
          </button>
          <button onClick={onCreateOffice}>{t('actions.createOffice')}</button>
        </div>
      </header>

      <div className="systemNotice">
        <span className="pulse" />
        <div>
          <strong>{t('init.backgroundTitle')}</strong>
          <p>可用 Runtime：{detectedCount} / 4，已建模 Persona/Profile：{personas.length}</p>
        </div>
      </div>

      <section className="officeConsoleGrid">
        {offices.map((office) => {
          const members = office.members ?? []
          const primary = members.find((member) => member.role === 'primary')
          const activeTasks = 0
          return (
            <article className="officeConsoleCard" key={office.id}>
              <div className="officeConsoleHead">
                <span className="officeIcon"><OfficeIcon /></span>
                <div>
                  <h2>{office.name}</h2>
                  <div className="officeStatusLine">
                    <Status value={office.paused ? 'standby' : 'online'} label={office.paused ? t('status.standby') : t('status.online')} />
                    <span>{primary?.persona?.name ?? '未设置主 Persona'}</span>
                  </div>
                </div>
                <button className="moreButton" title="更多"><MoreIcon /></button>
              </div>
              <div className="officeMembers">
                <strong>{t('office.activePersonas')}</strong>
                <span>{members.map((member) => `${member.runtime?.name ?? 'Runtime'} / ${member.persona?.name ?? member.persona_id}`).join('、') || '暂无成员'}</span>
              </div>
              <div className="officeMetrics">
                <div>
                  <small>{t('office.activeTasks')}</small>
                  <strong>{String(activeTasks).padStart(2, '0')}</strong>
                </div>
                <div>
                  <small>成员数量</small>
                  <strong>{members.length}</strong>
                </div>
              </div>
              <div className="officeConsoleFoot">
                <span>{t('office.lastActive')}: {formatDate(office.updated_at)}</span>
                <button onClick={() => onOpenOffice(office.id)}>查看</button>
              </div>
            </article>
          )
        })}

        <button className="createOfficeTile" onClick={onCreateOffice}>
          <span>+</span>
          <strong>{t('actions.createOffice')}</strong>
          <small>从 Persona/Profile 选择主成员和协作成员，保存到本地配置。</small>
        </button>
      </section>

      {offices.length === 0 ? (
        <section className="activityPanel emptyOffice">
          <div className="activityHeader">
            <h2>{t('office.emptyTitle')}</h2>
          </div>
          <ol>
            <li>先扫描本机 Hermes、OpenClaw、Codex、Claude Code。</li>
            <li>再进入创建办公室，选择至少两个 Persona/Profile。</li>
            <li>保存后，任务、会话、渠道都围绕办公室组织。</li>
          </ol>
        </section>
      ) : null}
    </>
  )
}

function OfficeDetailPage({
  config,
  office,
  onBack,
  onConfigSaved,
  t,
}: {
  config: AgentMeshConfig
  office?: Office
  onBack: () => void
  onConfigSaved: () => Promise<void>
  t: Translator
}) {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [officeDraft, setOfficeDraft] = useState<Partial<Office>>({})
  const [memberRows, setMemberRows] = useState<OfficeMember[]>([])
  const [channelRows, setChannelRows] = useState<Channel[]>([])
  const [newMemberPersonaId, setNewMemberPersonaId] = useState<string>('')
  const [policyDraft, setPolicyDraft] = useState<PermissionPolicy | null>(null)
  const [taskTypeDraft, setTaskTypeDraft] = useState<TaskType | null>(null)
  const [routingDraft, setRoutingDraft] = useState<RoutingPolicy | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    void agentMeshApi.listTasks().then(setTasks).catch(() => setTasks([]))
  }, [])

  useEffect(() => {
    if (!office) return

    const currentPolicy = office.default_permission_policy_id
      ? config.permissionPolicies?.[office.default_permission_policy_id]
      : undefined
    const currentTaskType = office.default_task_type_id
      ? config.taskTypes?.[office.default_task_type_id]
      : Object.values(config.taskTypes ?? {})[0]
    const currentRoutingPolicy = office.default_routing_policy_id
      ? config.routingPolicies?.[office.default_routing_policy_id]
      : Object.values(config.routingPolicies ?? {}).find((policy) => policy.office_id === office.id)

    setOfficeDraft({
      name: office.name,
      description: office.description ?? '',
      default_workspace_path: office.default_workspace_path ?? '.',
      paused: office.paused ?? false,
    })
    setMemberRows((office.members ?? []).map((member) => ({ ...member })))
    setChannelRows((office.channels?.length ? office.channels : [emptyChannel(office)]).map((channel) => ({
      ...channel,
      office_id: office.id,
      primary_member_id: channel.primary_member_id || (office.members ?? []).find((member) => member.role === 'primary')?.id,
      permission_policy_id: channel.permission_policy_id || office.default_permission_policy_id,
    })))
    setNewMemberPersonaId('')
    setPolicyDraft(currentPolicy ? { ...currentPolicy } : {
      id: office.default_permission_policy_id ?? `policy_${office.id}_safe`,
      name: `${office.name} 安全策略`,
      default_mode: 'safe-write',
      require_confirmation: ['run_destructive_command'],
      allowed_channels: ['agent-mesh-chat', 'cli'],
      allowed_runtime_kinds: ['hermes', 'openclaw', 'codex', 'claude-code'],
    })
    setTaskTypeDraft(currentTaskType ? { ...currentTaskType } : emptyTaskType(office))
    setRoutingDraft(currentRoutingPolicy ? { ...currentRoutingPolicy } : emptyRoutingPolicy(office))
    setSaveState('idle')
    setSaveError(null)
  }, [config.permissionPolicies, config.routingPolicies, config.taskTypes, office])

  if (!office) {
    return (
      <section className="settingsPanel">
        <SectionHeader title="办公室详情" description="尚未选择办公室。" />
        <button className="secondaryButton" onClick={onBack}>返回</button>
      </section>
    )
  }

  const members = memberRows.length > 0 ? memberRows : (office.members ?? [])
  const channels = channelRows
  const policy = office.default_permission_policy_id
    ? config.permissionPolicies?.[office.default_permission_policy_id]
    : undefined
  const taskType = office.default_task_type_id
    ? config.taskTypes?.[office.default_task_type_id]
    : undefined
  const routingPolicy = office.default_routing_policy_id
    ? config.routingPolicies?.[office.default_routing_policy_id]
    : undefined
  const primaryMember = members.find((member) => member.role === 'primary') ?? members[0]
  const recentTasks = tasks.slice(0, 5)
  const availablePersonas = Object.values(config.personas).filter((persona) => (
    persona.enabled !== false && !members.some((member) => member.persona_id === persona.id)
  ))

  function updateMemberRow(memberId: string, patch: Partial<OfficeMember>) {
    setMemberRows((current) => current.map((member) => (
      member.id === memberId ? { ...member, ...patch } : member
    )))
  }

  function addOfficeMember() {
    const persona = config.personas[newMemberPersonaId]
    if (!persona || members.some((member) => member.persona_id === persona.id)) return

    const runtime = config.runtimes[persona.runtime_id]
    const memberId = `member_${office.id}_${slugify(persona.name)}_${Date.now()}`
    const nextMember: OfficeMember = {
      id: memberId,
      office_id: office.id,
      persona_id: persona.id,
      role: members.length === 0 ? 'primary' : 'collaborator',
      office_title: members.length === 0 ? '主入口与任务路由' : '协作 Agent',
      responsibility: persona.description ?? '执行办公室分配的协作任务。',
      enabled: true,
      persona,
      runtime,
    }
    setMemberRows((current) => [...current, nextMember])
    setNewMemberPersonaId('')
  }

  function removeOfficeMember(memberId: string) {
    if (members.length <= 1) return

    setMemberRows((current) => {
      const nextMembers = current.filter((member) => member.id !== memberId)
      if (!nextMembers.some((member) => member.role === 'primary') && nextMembers[0]) {
        nextMembers[0] = { ...nextMembers[0], role: 'primary' }
      }
      return nextMembers
    })
    setChannelRows((current) => current.map((channel) => (
      channel.primary_member_id === memberId
        ? { ...channel, primary_member_id: primaryMember?.id === memberId ? undefined : primaryMember?.id }
        : channel
    )))
  }

  function addChannelRow() {
    const nextChannel: Channel = {
      id: `channel_${office.id}_${Date.now()}`,
      type: 'agent-mesh-chat',
      name: `Channel ${channels.length + 1}`,
      office_id: office.id,
      primary_member_id: primaryMember?.id,
      permission_policy_id: policyDraft?.id ?? office.default_permission_policy_id,
      enabled: true,
    }
    setChannelRows((current) => [...current, nextChannel])
  }

  function updateChannelRow(channelId: string, patch: Partial<Channel>) {
    setChannelRows((current) => current.map((channel) => (
      channel.id === channelId ? { ...channel, ...patch } : channel
    )))
  }

  function removeChannelRow(channelId: string) {
    if (channels.length <= 1) return
    setChannelRows((current) => current.filter((channel) => channel.id !== channelId))
  }

  async function saveOfficeDetail() {
    if (!office || !policyDraft || !taskTypeDraft || !routingDraft || members.length === 0 || channels.length === 0) return

    const now = new Date().toISOString()
    const primaryChannel = channels[0]
    const nextOffice: Office = {
      ...office,
      name: officeDraft.name?.trim() || office.name,
      description: String(officeDraft.description ?? ''),
      default_workspace_path: officeDraft.default_workspace_path?.trim() || '.',
      default_permission_policy_id: policyDraft.id,
      default_channel_id: primaryChannel.id,
      default_task_type_id: taskTypeDraft.id,
      default_routing_policy_id: routingDraft.id,
      paused: Boolean(officeDraft.paused),
      updated_at: now,
    }
    const nextMembers = Object.fromEntries(members.map((member) => [
      member.id,
      stripJoinedOfficeMember({
        ...member,
        office_id: office.id,
        office_title: member.office_title.trim() || member.persona?.name || member.persona_id,
        responsibility: String(member.responsibility ?? ''),
        enabled: member.enabled ?? true,
      }),
    ]))
    const nextChannels = Object.fromEntries(channels.map((channel, index) => [
      channel.id,
      {
        ...channel,
        name: channel.name.trim() || `Channel ${index + 1}`,
        office_id: office.id,
        primary_member_id: channel.primary_member_id || primaryMember?.id,
        permission_policy_id: policyDraft.id,
        enabled: channel.enabled ?? true,
      },
    ]))
    const nextRoutingPolicy: RoutingPolicy = {
      ...routingDraft,
      office_id: office.id,
      task_type_id: taskTypeDraft.id,
      fallback_member_id: routingDraft.fallback_member_id || primaryMember?.id,
    }

    const retainedMembers = Object.fromEntries(Object.entries(config.officeMembers).filter(([, member]) => member.office_id !== office.id))
    const retainedChannels = Object.fromEntries(Object.entries(config.channels ?? {}).filter(([, channel]) => channel.office_id !== office.id))
    const nextConfig: AgentMeshConfig = {
      ...config,
      offices: {
        ...config.offices,
        [office.id]: stripJoinedOffice(nextOffice),
      },
      officeMembers: {
        ...retainedMembers,
        ...nextMembers,
      },
      channels: {
        ...retainedChannels,
        ...nextChannels,
      },
      permissionPolicies: {
        ...(config.permissionPolicies ?? {}),
        [policyDraft.id]: policyDraft,
      },
      taskTypes: {
        ...(config.taskTypes ?? {}),
        [taskTypeDraft.id]: taskTypeDraft,
      },
      routingPolicies: {
        ...(config.routingPolicies ?? {}),
        [nextRoutingPolicy.id]: nextRoutingPolicy,
      },
    }

    setSaveState('saving')
    setSaveError(null)
    try {
      await agentMeshApi.saveConfig(nextConfig)
      await onConfigSaved()
      setSaveState('saved')
    } catch (error) {
      setSaveState('failed')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="breadcrumb">OFFICES / DETAIL</div>
          <h1>{office.name}</h1>
          <p>{office.description ?? '这个办公室还没有说明。'}</p>
        </div>
        <div className="actions">
          <button disabled={saveState === 'saving'} onClick={() => void saveOfficeDetail()}>
            {saveState === 'saving' ? '保存中' : '保存修改'}
          </button>
          <button className="secondaryButton" onClick={onBack}>返回办公室</button>
        </div>
      </header>

      {saveState === 'saved' ? <div className="saveNotice officeSaveNotice">办公室配置已保存。</div> : null}
      {saveState === 'failed' ? <div className="saveNotice officeSaveNotice error">{saveError ?? '保存失败'}</div> : null}

      <section className="officeDetailLayout">
        <div className="officeDetailHero">
          <div>
            <span className="officeIcon"><OfficeIcon /></span>
            <div>
              <h2>{office.name}</h2>
              <p>主成员：{primaryMember?.runtime?.name ?? 'Runtime'} / {primaryMember?.persona?.name ?? '未设置'}</p>
            </div>
          </div>
          <Status value={office.paused ? 'standby' : 'online'} label={office.paused ? t('status.standby') : t('status.online')} />
        </div>

        <Panel title="基础配置">
          <div className="officeEditGrid">
            <label>
              <span>办公室名称</span>
              <input value={String(officeDraft.name ?? '')} onChange={(event) => setOfficeDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>工作目录</span>
              <input value={String(officeDraft.default_workspace_path ?? '')} onChange={(event) => setOfficeDraft((current) => ({ ...current, default_workspace_path: event.target.value }))} />
            </label>
            <label className="wideField">
              <span>说明</span>
              <textarea rows={3} value={String(officeDraft.description ?? '')} onChange={(event) => setOfficeDraft((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label className="checkField">
              <input checked={Boolean(officeDraft.paused)} type="checkbox" onChange={(event) => setOfficeDraft((current) => ({ ...current, paused: event.target.checked }))} />
              <span>暂停这个办公室</span>
            </label>
          </div>
        </Panel>

        <div className="officeDetailStats">
          <div>
            <small>成员</small>
            <strong>{members.length}</strong>
          </div>
          <div>
            <small>渠道</small>
            <strong>{channels.length}</strong>
          </div>
          <div>
            <small>权限策略</small>
            <strong>{policy?.name ?? '未绑定'}</strong>
          </div>
          <div>
            <small>工作目录</small>
            <strong>{office.default_workspace_path ?? '-'}</strong>
          </div>
          <div>
            <small>任务类型</small>
            <strong>{taskType?.name ?? taskTypeDraft?.name ?? '未配置'}</strong>
          </div>
          <div>
            <small>路由策略</small>
            <strong>{routingPolicy?.name ?? routingDraft?.name ?? '未配置'}</strong>
          </div>
        </div>

        <div className="officeDetailGrid">
          <Panel title="成员与角色">
            <div className="officeInlineToolbar">
              <select value={newMemberPersonaId} onChange={(event) => setNewMemberPersonaId(event.target.value)}>
                <option value="">选择 Persona/Profile</option>
                {availablePersonas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {config.runtimes[persona.runtime_id]?.name ?? persona.runtime_id} / {persona.name}
                  </option>
                ))}
              </select>
              <button disabled={!newMemberPersonaId} onClick={addOfficeMember}>添加成员</button>
            </div>
            <div className="nodeStack">
              {members.map((member) => (
                <div className="officeMemberDetail" key={member.id}>
                  <AgentLogo kind={runtimeKindOfMember(member)} compact />
                  <div>
                    <strong>{member.runtime?.name ?? 'Runtime'} / {member.persona?.name ?? member.persona_id}</strong>
                    <span>{member.runtime?.name ?? 'Runtime'} / {member.persona?.name ?? member.persona_id}</span>
                    <div className="memberEditGrid">
                      <input
                        value={member.office_title}
                        onChange={(event) => updateMemberRow(member.id, { office_title: event.target.value })}
                      />
                      <select
                        value={member.role}
                        onChange={(event) => updateMemberRow(member.id, { role: event.target.value as OfficeMember['role'] })}
                      >
                        <option value="primary">primary</option>
                        <option value="collaborator">collaborator</option>
                        <option value="reviewer">reviewer</option>
                        <option value="observer">observer</option>
                      </select>
                      <textarea
                        rows={2}
                        value={String(member.responsibility ?? '')}
                        onChange={(event) => updateMemberRow(member.id, { responsibility: event.target.value })}
                      />
                      <label className="checkField">
                        <input
                          checked={member.enabled ?? true}
                          type="checkbox"
                          onChange={(event) => updateMemberRow(member.id, { enabled: event.target.checked })}
                        />
                        <span>启用</span>
                      </label>
                      <button className="secondaryButton" disabled={members.length <= 1} onClick={() => removeOfficeMember(member.id)}>
                        移除成员
                      </button>
                    </div>
                  </div>
                  <Status value={member.enabled === false ? 'offline' : 'online'} label={member.role} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="渠道">
            <div className="nodeStack">
              {channels.map((channel) => (
                <div className="channelEditorRow" key={channel.id}>
                  <div className="officeEditGrid compact">
                    <label>
                      <span>名称</span>
                      <input value={channel.name} onChange={(event) => updateChannelRow(channel.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>类型</span>
                      <select value={channel.type} onChange={(event) => updateChannelRow(channel.id, { type: event.target.value })}>
                        <option value="agent-mesh-chat">agent-mesh-chat</option>
                        <option value="cli">cli</option>
                        <option value="feishu">feishu</option>
                        <option value="wechat">wechat</option>
                        <option value="discord">discord</option>
                        <option value="api">api</option>
                      </select>
                    </label>
                    <label>
                      <span>主成员</span>
                      <select value={channel.primary_member_id ?? primaryMember?.id ?? ''} onChange={(event) => updateChannelRow(channel.id, { primary_member_id: event.target.value })}>
                        {members.map((member) => <option key={member.id} value={member.id}>{member.office_title}</option>)}
                      </select>
                    </label>
                    <label className="checkField">
                      <input checked={channel.enabled ?? true} type="checkbox" onChange={(event) => updateChannelRow(channel.id, { enabled: event.target.checked })} />
                      <span>启用渠道</span>
                    </label>
                  </div>
                  <button className="secondaryButton" disabled={channels.length <= 1} onClick={() => removeChannelRow(channel.id)}>移除渠道</button>
                </div>
              ))}
              <button className="secondaryButton" onClick={addChannelRow}>添加渠道</button>
            </div>
          </Panel>

          <Panel title="权限策略">
            <div className="officeEditGrid compact">
              <label>
                <span>策略名称</span>
                <input value={policyDraft?.name ?? ''} onChange={(event) => setPolicyDraft((current) => ({ ...(current ?? emptyPolicy(office)), name: event.target.value }))} />
              </label>
              <label>
                <span>默认模式</span>
                <select value={policyDraft?.default_mode ?? 'read-only'} onChange={(event) => setPolicyDraft((current) => ({ ...(current ?? emptyPolicy(office)), default_mode: event.target.value as PermissionMode }))}>
                  <option value="read-only">read-only</option>
                  <option value="safe-write">safe-write</option>
                  <option value="full-access">full-access</option>
                </select>
              </label>
              <label className="wideField">
                <span>需要确认</span>
                <input value={(policyDraft?.require_confirmation ?? []).join(', ')} onChange={(event) => setPolicyDraft((current) => ({ ...(current ?? emptyPolicy(office)), require_confirmation: splitCsv(event.target.value) }))} />
              </label>
              <label className="wideField">
                <span>允许渠道</span>
                <input value={(policyDraft?.allowed_channels ?? []).join(', ')} onChange={(event) => setPolicyDraft((current) => ({ ...(current ?? emptyPolicy(office)), allowed_channels: splitCsv(event.target.value) }))} />
              </label>
            </div>
          </Panel>

          <Panel title="任务类型与路由">
            <div className="officeEditGrid compact">
              <label>
                <span>任务类型名称</span>
                <input value={taskTypeDraft?.name ?? ''} onChange={(event) => setTaskTypeDraft((current) => ({ ...(current ?? emptyTaskType(office)), name: event.target.value }))} />
              </label>
              <label>
                <span>任务类型说明</span>
                <textarea rows={3} value={taskTypeDraft?.description ?? ''} onChange={(event) => setTaskTypeDraft((current) => ({ ...(current ?? emptyTaskType(office)), description: event.target.value }))} />
              </label>
              <label>
                <span>任务所需能力</span>
                <input value={(taskTypeDraft?.required_capabilities ?? []).join(', ')} onChange={(event) => setTaskTypeDraft((current) => ({ ...(current ?? emptyTaskType(office)), required_capabilities: splitCsv(event.target.value) }))} />
              </label>
              <label>
                <span>默认验收标准</span>
                <textarea rows={3} value={(taskTypeDraft?.default_acceptance ?? []).join('\n')} onChange={(event) => setTaskTypeDraft((current) => ({ ...(current ?? emptyTaskType(office)), default_acceptance: splitLines(event.target.value) }))} />
              </label>
              <label>
                <span>默认约束</span>
                <textarea rows={3} value={(taskTypeDraft?.default_constraints ?? []).join('\n')} onChange={(event) => setTaskTypeDraft((current) => ({ ...(current ?? emptyTaskType(office)), default_constraints: splitLines(event.target.value) }))} />
              </label>
              <label>
                <span>路由策略名称</span>
                <input value={routingDraft?.name ?? ''} onChange={(event) => setRoutingDraft((current) => ({ ...(current ?? emptyRoutingPolicy(office)), name: event.target.value }))} />
              </label>
              <label>
                <span>路由算法</span>
                <select value={routingDraft?.strategy ?? 'capability-match'} onChange={(event) => setRoutingDraft((current) => ({ ...(current ?? emptyRoutingPolicy(office)), strategy: event.target.value as RoutingPolicy['strategy'] }))}>
                  <option value="capability-match">capability-match</option>
                  <option value="primary-first">primary-first</option>
                  <option value="manual">manual</option>
                  <option value="round-robin">round-robin</option>
                </select>
              </label>
              <label>
                <span>兜底成员</span>
                <select value={routingDraft?.fallback_member_id ?? primaryMember?.id ?? ''} onChange={(event) => setRoutingDraft((current) => ({ ...(current ?? emptyRoutingPolicy(office)), fallback_member_id: event.target.value }))}>
                  {members.map((member) => <option key={member.id} value={member.id}>{member.office_title}</option>)}
                </select>
              </label>
              <label>
                <span>优先成员</span>
                <input value={(routingDraft?.preferred_member_ids ?? []).join(', ')} onChange={(event) => setRoutingDraft((current) => ({ ...(current ?? emptyRoutingPolicy(office)), preferred_member_ids: splitCsv(event.target.value) }))} />
              </label>
              <label>
                <span>路由所需能力</span>
                <input value={(routingDraft?.required_capabilities ?? []).join(', ')} onChange={(event) => setRoutingDraft((current) => ({ ...(current ?? emptyRoutingPolicy(office)), required_capabilities: splitCsv(event.target.value) }))} />
              </label>
            </div>
          </Panel>

          <Panel title="最近任务">
            <div className="nodeStack">
              {recentTasks.length > 0 ? recentTasks.map((task) => (
                <div className="officeTaskRow" key={task.id}>
                  <div>
                    <strong>{task.objective}</strong>
                    <small>#{task.id} / {task.agent} / {formatDate(task.updated_at)}</small>
                  </div>
                  <Status value={task.status} label={t(`status.${task.status}`)} />
                </div>
              )) : <div className="emptyOffice">暂未发现任务记录。</div>}
              <p className="mutedText">当前历史任务尚未全部写入 office_id，后续会按办公室精确筛选。</p>
            </div>
          </Panel>

          <Panel title="会话状态">
            <div className="sessionGrid">
              {members.map((member) => (
                <div className="sessionCard" key={`${member.id}-session`}>
                  <strong>{member.persona?.name ?? member.persona_id}</strong>
                  <span>Session: 待 Adapter 接入</span>
                  <small>下一阶段会接入 getSessionStatus / reset。</small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </>
  )
}

function OfficeCreatePage({
  officeDraft,
  personas,
  runtimeAssets,
  setActivePage,
  setOfficeDraft,
  onSaved,
  t,
}: {
  officeDraft: OfficeDraft
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  setActivePage: Dispatch<SetStateAction<PageId>>
  setOfficeDraft: Dispatch<SetStateAction<OfficeDraft>>
  onSaved: () => Promise<void>
  t: Translator
}) {
  const enabledPersonas = personas.filter((persona) => persona.enabled !== false)
  const primaryPersona = enabledPersonas.find((persona) => persona.id === officeDraft.primaryPersonaId)
  const collaborators = officeDraft.collaboratorPersonaIds
    .map((id) => enabledPersonas.find((persona) => persona.id === id))
    .filter((persona): persona is Persona => Boolean(persona))
  const canCreateOffice = officeDraft.name.trim().length > 0 && Boolean(primaryPersona) && collaborators.length > 0

  function updateDraft(patch: Partial<OfficeDraft>) {
    setOfficeDraft((current) => ({ ...current, ...patch }))
  }

  function toggleCollaborator(personaId: string) {
    setOfficeDraft((current) => {
      const nextCollaborators = current.collaboratorPersonaIds.includes(personaId)
        ? current.collaboratorPersonaIds.filter((id) => id !== personaId)
        : [...current.collaboratorPersonaIds, personaId]

      return {
        ...current,
        collaboratorPersonaIds: nextCollaborators.filter((id) => id !== current.primaryPersonaId),
      }
    })
  }

  async function createOffice() {
    if (!canCreateOffice || !primaryPersona) return

    const now = new Date().toISOString()
    const officeId = `office_${slugify(officeDraft.name)}_${Date.now()}`
    const primaryMemberId = `${officeId}_primary`
    const members: OfficeMember[] = [
      {
        id: primaryMemberId,
        office_id: officeId,
        persona_id: primaryPersona.id,
        role: 'primary',
        office_title: '主入口与任务路由',
        responsibility: '接收用户或渠道任务，负责分派与状态回传。',
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

    await agentMeshApi.saveOffice({
      office: {
        id: officeId,
        name: officeDraft.name.trim(),
        description: officeDraft.description.trim(),
        default_permission_policy_id: officeDraft.permissionMode === 'read-only' ? 'policy_local_readonly' : 'policy_local_safe_dev',
        default_channel_id: `${officeId}_channel_chat`,
        default_workspace_path: '.',
        paused: false,
        created_at: now,
        updated_at: now,
      },
      members,
      channel: {
        id: `${officeId}_channel_chat`,
        type: 'agent-mesh-chat',
        name: 'Agent Mesh Chat',
        office_id: officeId,
        primary_member_id: primaryMemberId,
        permission_policy_id: officeDraft.permissionMode === 'read-only' ? 'policy_local_readonly' : 'policy_local_safe_dev',
        enabled: true,
      },
    })
    await onSaved()
    setActivePage('offices')
  }

  return (
    <section className="officeBuilder standaloneBuilder">
      <div className="builderHero">
        <div>
          <div className="breadcrumb">OFFICES / {t('actions.createOffice')}</div>
          <h1>{t('office.builderTitle')}</h1>
          <p>从已建模的 Persona/Profile 中挑选成员。这里选择的是身份，不是单纯的软件名。</p>
        </div>
        <Status value="available" label="Persona Ready" />
      </div>

      <div className="builderStepper">
        {['基础信息', '选择主 Persona', '选择协作成员', '默认权限', '预览保存'].map((step, index) => (
          <div className={index <= 4 ? 'step active' : 'step'} key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="builderGrid refinedBuilderGrid">
        <Panel title={t('office.basicInfoTitle')}>
          <div className="fieldStack">
            <label>
              <span>{t('office.nameLabel')}</span>
              <input value={officeDraft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>
            <label>
              <span>{t('office.descriptionLabel')}</span>
              <textarea rows={5} value={officeDraft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
            </label>
          </div>
        </Panel>

        <Panel title={t('office.primaryMemberTitle')}>
          <div className="choiceGrid">
            {enabledPersonas.map((persona) => (
              <button
                className={officeDraft.primaryPersonaId === persona.id ? 'choiceCard selected' : 'choiceCard'}
                key={persona.id}
                onClick={() => updateDraft({
                  primaryPersonaId: persona.id,
                  collaboratorPersonaIds: officeDraft.collaboratorPersonaIds.filter((id) => id !== persona.id),
                })}
              >
                <AgentLogo kind={runtimeKindOf(persona)} compact />
                <span>
                  <strong>{persona.runtime?.name ?? persona.runtime_id} / {persona.name}</strong>
                  <small>{persona.description ?? persona.profile_key ?? persona.id}</small>
                </span>
                <Status value={runtimeStatusOf(persona, runtimeAssets)} label={t(`status.${runtimeStatusOf(persona, runtimeAssets)}`)} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t('office.collaboratorTitle')}>
          <div className="choiceGrid">
            {enabledPersonas.filter((persona) => persona.id !== officeDraft.primaryPersonaId).map((persona) => (
              <button
                className={officeDraft.collaboratorPersonaIds.includes(persona.id) ? 'choiceCard selected' : 'choiceCard'}
                key={persona.id}
                onClick={() => toggleCollaborator(persona.id)}
              >
                <AgentLogo kind={runtimeKindOf(persona)} compact />
                <span>
                  <strong>{persona.runtime?.name ?? persona.runtime_id} / {persona.name}</strong>
                  <small>{(persona.capabilities ?? []).slice(0, 3).join(' / ') || '待配置能力'}</small>
                </span>
                <span className="roleLabel">{officeDraft.collaboratorPersonaIds.includes(persona.id) ? t('office.selected') : t('office.optional')}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t('office.permissionTitle')}>
          <SegmentedControl
            value={officeDraft.permissionMode}
            options={[
              ['read-only', t('permission.read-only')],
              ['safe-write', t('permission.safe-write')],
              ['full-access', t('permission.full-access')],
            ]}
            onChange={(value) => updateDraft({ permissionMode: value as PermissionMode })}
          />
          <p className="mutedText permissionHint">{t(`permissionHint.${officeDraft.permissionMode}`)}</p>
        </Panel>

        <Panel title={t('office.generatedPreviewTitle')}>
          <div className="officePreviewCard">
            <div>
              <strong>{officeDraft.name || t('office.unnamedOffice')}</strong>
              <small>{officeDraft.description}</small>
            </div>
            <div className="nodeStack">
              {primaryPersona ? <OfficeMemberRow persona={primaryPersona} roleLabel={t('role.primary')} /> : null}
              {collaborators.map((persona) => (
                <OfficeMemberRow persona={persona} key={persona.id} roleLabel={t('role.executor')} />
              ))}
            </div>
            <div className="builderActions">
              <button className="secondaryButton" onClick={() => setActivePage('offices')}>{t('actions.cancel')}</button>
              <button disabled={!canCreateOffice} onClick={() => void createOffice()}>{t('actions.saveOffice')}</button>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function ChatPage({ config, offices }: { config: AgentMeshConfig; offices: Office[] }) {
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

  const createdTaskStatus = typeof createdTaskDetail?.status === 'string' ? createdTaskDetail.status : createdTaskId ? 'queued' : 'unknown'
  const shouldPollCreatedTask = Boolean(createdTaskId && ['queued', 'running'].includes(createdTaskStatus))

  useEffect(() => {
    if (!createdTaskId) {
      setCreatedTaskDetail(null)
      setCreatedTaskLogs([])
      return
    }

    void refreshCreatedTask(createdTaskId)
  }, [createdTaskId])

  useEffect(() => {
    if (!createdTaskId || !shouldPollCreatedTask) return

    const timer = window.setInterval(() => {
      void refreshCreatedTask(createdTaskId)
    }, 2000)

    return () => window.clearInterval(timer)
  }, [createdTaskId, shouldPollCreatedTask])

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

  return (
    <>
      <header className="topbar">
        <div>
          <div className="breadcrumb">LOCAL CHANNEL / AGENT MESH CHAT</div>
          <h1>Agent Mesh Chat</h1>
          <p>从本地 Channel 发起任务，按办公室 TaskType / RoutingPolicy 生成任务草案并返回 task_id。</p>
        </div>
        <div className="actions">
          <button disabled={!canCreateTask || submitState === 'submitting'} onClick={() => void createTask()}>
            {submitState === 'submitting' ? '创建中' : '创建任务'}
          </button>
        </div>
      </header>

      {createdTaskId ? (
        <div className="saveNotice officeSaveNotice chatDispatchNotice">
          <span>任务已创建：#{createdTaskId}。确认后可手动派发给当前执行成员。</span>
          <button disabled={dispatchState === 'dispatching'} onClick={() => void dispatchTask()}>
            {dispatchState === 'dispatching' ? '派发中' : '派发执行'}
          </button>
        </div>
      ) : null}
      {dispatchState === 'dispatched' ? (
        <div className="saveNotice officeSaveNotice">任务已进入后台执行，可到任务页刷新查看事件、日志和结果。</div>
      ) : null}
      {submitState === 'failed' ? <div className="saveNotice officeSaveNotice error">{submitError ?? '创建失败'}</div> : null}

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
            <label>
              <span>验收标准</span>
              <textarea rows={4} value={acceptanceText} onChange={(event) => setAcceptanceText(event.target.value)} />
            </label>
            <label>
              <span>约束</span>
              <textarea rows={4} value={constraintsText} onChange={(event) => setConstraintsText(event.target.value)} />
            </label>
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
              <span>{selectedRoutingPolicy?.strategy ?? '-'}</span>
              <strong>任务能力</strong>
              <span>{(selectedTaskType?.required_capabilities ?? []).join(' / ') || '-'}</span>
              <strong>路由能力</strong>
              <span>{(selectedRoutingPolicy?.required_capabilities ?? []).join(' / ') || '-'}</span>
            </div>
          </Panel>
          {createdTaskId ? (
            <Panel title="任务回执">
              <div className="chatTaskReceipt">
                <div className="drawerHeader compactHeader">
                  <div>
                    <strong className="monoText">#{createdTaskId}</strong>
                    <small>Updated: {formatDate(typeof createdTaskDetail?.updatedAt === 'string' ? createdTaskDetail.updatedAt : undefined)}</small>
                  </div>
                  <Status value={createdTaskStatus} label={createdTaskStatus} />
                </div>
                <div className="drawerSection compactSection">
                  <h3>结果摘要</h3>
                  <div className="logPreview compactLog">
                    <span>{extractResultSummary(createdTaskDetail)}</span>
                  </div>
                </div>
                <div className="drawerSection compactSection">
                  <h3>最近日志</h3>
                  <div className="logPreview compactLog">
                    {createdTaskLogs.flatMap((log) => log.lines.map((line) => `${shortFileName(log.path)} ${line}`)).slice(-18).map((line, index) => (
                      <span key={`${index}-${line}`}>{line}</span>
                    ))}
                    {createdTaskLogs.length === 0 ? <span>暂无日志。</span> : null}
                  </div>
                </div>
                <button className="secondaryButton" onClick={() => void refreshCreatedTask()}>
                  刷新任务状态
                </button>
              </div>
            </Panel>
          ) : null}
        </aside>
      </section>
    </>
  )
}

function AgentsPage({
  adapterStatuses,
  config,
  personas,
  runtimeAssets,
  scanError,
  scanState,
  onConfigSaved,
  onRescan,
  t,
}: {
  adapterStatuses: RuntimeAdapterStatus[]
  config: AgentMeshConfig
  personas: Persona[]
  runtimeAssets: RuntimeAsset[]
  scanError: string | null
  scanState: RuntimeScanState
  onConfigSaved: () => Promise<void>
  onRescan: () => void
  t: Translator
}) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [runtimePathDrafts, setRuntimePathDrafts] = useState<Record<string, string>>({})
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>({
    runtimeId: '',
    name: '',
    profileKey: '',
    description: '',
    capabilities: '',
    skills: '',
    mcpBindings: '',
  })
  const [personaEditDraft, setPersonaEditDraft] = useState<PersonaDraft>({
    runtimeId: '',
    name: '',
    profileKey: '',
    description: '',
    capabilities: '',
    skills: '',
    mcpBindings: '',
  })
  const [assetSaveState, setAssetSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [assetSaveError, setAssetSaveError] = useState<string | null>(null)
  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId) ?? personas[0]
  const selectedRuntime = selectedPersona ? runtimeOf(selectedPersona, runtimeAssets, config) : undefined
  const status = selectedPersona ? runtimeStatusOf(selectedPersona, runtimeAssets) : 'unknown'
  const selectedAdapterStatus = selectedPersona
    ? adapterStatuses.find((adapter) => adapter.runtime_kind === runtimeKindOf(selectedPersona))
    : undefined
  const selectedRuntimeId = selectedPersona?.runtime_id ?? Object.keys(config.runtimes)[0] ?? ''
  const selectedConfigRuntime = selectedRuntimeId ? config.runtimes[selectedRuntimeId] : undefined
  const selectedRuntimePath = selectedRuntimeId
    ? runtimePathDrafts[selectedRuntimeId] ?? selectedConfigRuntime?.executable_path ?? selectedConfigRuntime?.command ?? ''
    : ''
  const selectedPersonaInUse = selectedPersona
    ? Object.values(config.officeMembers).some((member) => member.persona_id === selectedPersona.id)
    : false

  useEffect(() => {
    if (!selectedPersonaId && personas[0]) setSelectedPersonaId(personas[0].id)
  }, [personas, selectedPersonaId])

  useEffect(() => {
    if (!selectedPersona) return

    setPersonaEditDraft({
      runtimeId: selectedPersona.runtime_id,
      name: selectedPersona.name,
      profileKey: selectedPersona.profile_key ?? '',
      description: selectedPersona.description ?? '',
      capabilities: (selectedPersona.capabilities ?? []).join(', '),
      skills: (selectedPersona.skills ?? []).join(', '),
      mcpBindings: (selectedPersona.mcp_bindings ?? []).join(', '),
    })
  }, [selectedPersona?.id])

  useEffect(() => {
    setPersonaDraft((current) => ({
      ...current,
      runtimeId: current.runtimeId || Object.keys(config.runtimes)[0] || '',
    }))
  }, [config.runtimes])

  const groups = useMemo(() => {
    return Object.values(config.runtimes).map((runtime) => ({
      runtime,
      personas: personas.filter((persona) => persona.runtime_id === runtime.id),
    }))
  }, [config.runtimes, personas])

  async function saveRuntimePath() {
    if (!selectedRuntimeId || !selectedConfigRuntime) return

    await saveConfigPatch({
      ...config,
      runtimes: {
        ...config.runtimes,
        [selectedRuntimeId]: {
          ...selectedConfigRuntime,
          command: selectedRuntimePath.trim() || selectedConfigRuntime.command,
          executable_path: selectedRuntimePath.trim() || undefined,
          health: 'unknown',
          installed: false,
        },
      },
    })
  }

  async function addPersona() {
    const runtimeId = personaDraft.runtimeId || Object.keys(config.runtimes)[0]
    if (!runtimeId || !personaDraft.name.trim()) return

    const profileKey = personaDraft.profileKey.trim() || slugify(personaDraft.name)
    const personaId = `persona_${runtimeId.replace(/^runtime_/, '')}_${slugify(profileKey)}_${Date.now()}`
    const nextPersona: Persona = {
      id: personaId,
      runtime_id: runtimeId,
      name: personaDraft.name.trim(),
      profile_key: profileKey,
      description: personaDraft.description.trim() || undefined,
      capabilities: splitCsv(personaDraft.capabilities),
      skills: splitCsv(personaDraft.skills),
      mcp_bindings: splitCsv(personaDraft.mcpBindings),
      enabled: true,
      source: 'manual',
    }

    await saveConfigPatch({
      ...config,
      personas: {
        ...config.personas,
        [personaId]: nextPersona,
      },
    })
    setSelectedPersonaId(personaId)
    setPersonaDraft({
      runtimeId,
      name: '',
      profileKey: '',
      description: '',
      capabilities: '',
      skills: '',
      mcpBindings: '',
    })
  }

  async function saveSelectedPersona() {
    if (!selectedPersona || !personaEditDraft.name.trim()) return

    const nextPersona: Persona = {
      ...selectedPersona,
      runtime_id: personaEditDraft.runtimeId || selectedPersona.runtime_id,
      name: personaEditDraft.name.trim(),
      profile_key: personaEditDraft.profileKey.trim() || undefined,
      description: personaEditDraft.description.trim() || undefined,
      capabilities: splitCsv(personaEditDraft.capabilities),
      skills: splitCsv(personaEditDraft.skills),
      mcp_bindings: splitCsv(personaEditDraft.mcpBindings),
      enabled: selectedPersona.enabled ?? true,
      source: selectedPersona.source ?? 'manual',
    }

    await saveConfigPatch({
      ...config,
      personas: {
        ...config.personas,
        [selectedPersona.id]: nextPersona,
      },
    })
  }

  async function toggleSelectedPersonaEnabled() {
    if (!selectedPersona) return

    await saveConfigPatch({
      ...config,
      personas: {
        ...config.personas,
        [selectedPersona.id]: {
          ...selectedPersona,
          enabled: !(selectedPersona.enabled ?? true),
        },
      },
    })
  }

  async function deleteSelectedPersona() {
    if (!selectedPersona || selectedPersonaInUse) return

    const nextPersonas = { ...config.personas }
    delete nextPersonas[selectedPersona.id]
    const fallbackPersonaId = personas.find((persona) => persona.id !== selectedPersona.id)?.id ?? ''

    await saveConfigPatch({
      ...config,
      personas: nextPersonas,
    })
    setSelectedPersonaId(fallbackPersonaId)
  }

  async function saveConfigPatch(nextConfig: AgentMeshConfig) {
    setAssetSaveState('saving')
    setAssetSaveError(null)
    try {
      await agentMeshApi.saveConfig(nextConfig)
      await onConfigSaved()
      setAssetSaveState('saved')
    } catch (error) {
      setAssetSaveState('failed')
      setAssetSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{t('agents.title')}</h1>
          <p>资产页按 Runtime 到 Persona/Profile 展示，点击身份查看配置、Skill、MCP 和适合角色。</p>
        </div>
        <div className="actions">
          <button disabled={scanState === 'scanning'} onClick={onRescan}>
            {scanState === 'scanning' ? t('actions.scanning') : t('actions.rescanBackground')}
          </button>
        </div>
      </header>

      {scanError ? (
        <div className="systemNotice warning">
          <span className="pulse warning" />
          <div>
            <strong>{t('agents.scanFailedTitle')}</strong>
            <p>{scanError}</p>
          </div>
        </div>
      ) : null}

      <section className="agentLibrary">
        <aside className="runtimeTreePane">
          <div className="treeHeader">
            <span>{t('agents.runtimeTreeTitle')}</span>
            <button disabled={scanState === 'scanning'} onClick={onRescan} title={t('actions.rescanBackground')}>
              <RefreshIcon />
            </button>
          </div>
          <div className="runtimeTree">
            {groups.map(({ runtime, personas: runtimePersonas }) => (
              <div className="runtimeGroup" key={runtime.id}>
                <div className="runtimeGroupTitle">
                  <ChevronIcon />
                  <AgentLogo kind={runtime.kind} compact />
                  <span>{runtime.name}</span>
                  <Status value={detectedRuntimeStatus(runtime, runtimeAssets)} label={t(`status.${detectedRuntimeStatus(runtime, runtimeAssets)}`)} />
                </div>
                <div className="personaList">
                  {runtimePersonas.map((persona) => (
                    <button
                      className={[
                        selectedPersona?.id === persona.id ? 'personaItem active' : 'personaItem',
                        persona.enabled === false ? 'disabledPersona' : '',
                      ].filter(Boolean).join(' ')}
                      key={persona.id}
                      onClick={() => setSelectedPersonaId(persona.id)}
                    >
                      <PersonaIcon />
                      <span>{persona.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="agentDetailPanel">
          {selectedPersona ? (
            <>
              <div className="agentDetailHeader">
                <AgentLogo kind={runtimeKindOf(selectedPersona)} />
                <div>
                  <h2>{selectedRuntime?.name ?? selectedPersona.runtime_id} / {selectedPersona.name}</h2>
                  <p>{selectedPersona.description ?? '暂无说明'}</p>
                </div>
                <Status value={status} label={t(`status.${status}`)} />
              </div>

              <div className="runtimeMetaBar">
                <span>Persona: {selectedPersona.id}</span>
                <span>{t('agents.connection')}: {selectedRuntime?.connection_type ?? '-'}</span>
                <span>{t('agents.detectedAt')}: {selectedRuntime?.detected_at ?? '-'}</span>
              </div>

              <div className="detailGrid">
                <DetailBlock
                  title={t('agents.configTitle')}
                  items={[
                    `${t('agents.command')}: ${runtimeCatalog[runtimeKindOf(selectedPersona)].command}`,
                    `${t('agents.path')}: ${selectedRuntime?.executable_path ?? selectedRuntime?.diagnostic ?? t('agents.notFound')}`,
                    `${t('agents.version')}: ${selectedRuntime?.version ?? t('agents.unknownVersion')}`,
                    `Profile: ${selectedPersona.profile_key ?? 'default'}`,
                  ]}
                />
                <DetailBlock title={t('agents.skillsTitle')} items={selectedPersona.skills ?? []} />
                <DetailBlock title={t('agents.mcpsTitle')} items={selectedPersona.mcp_bindings ?? []} />
                <DetailBlock title={t('agents.bestForTitle')} items={selectedPersona.capabilities ?? []} />
              </div>

              <div className="agentOpsGrid">
                <section className="metricPanel">
                  <h3>{t('agents.healthPanelTitle')}</h3>
                  <MetricBar label="Runtime" value={status} width={status === 'available' ? '100%' : '22%'} tone={status === 'available' ? 'success' : 'primary'} />
                  <MetricBar label="Persona Source" value={selectedPersona.source ?? 'manual'} width="72%" tone="success" />
                  <MetricBar label="Capabilities" value={String((selectedPersona.capabilities ?? []).length)} width="56%" />
                </section>
                <section className="logPanel">
                  <h3>{t('agents.logPanelTitle')}</h3>
                  <div className="terminalLog">
                    <span>Runtime: {selectedRuntime?.name ?? selectedPersona.runtime_id}</span>
                    <span>Persona: {selectedPersona.name}</span>
                    <span>自动发现：{selectedPersona.source === 'detected' ? '已接入' : '待后续 Adapter 深化'}</span>
                    <span>MCP: {(selectedPersona.mcp_bindings ?? []).join(', ') || '未绑定'}</span>
                  </div>
                </section>
              </div>

              {selectedAdapterStatus ? (
                <section className="adapterPanel">
                  <div className="adapterPanelHeader">
                    <div>
                      <h3>Adapter 能力</h3>
                      <p>{selectedAdapterStatus.notes}</p>
                    </div>
                    <Status value={selectedAdapterStatus.dispatch === 'verified' ? 'available' : selectedAdapterStatus.dispatch === 'implemented' ? 'degraded' : 'standby'} label={adapterStateLabel(selectedAdapterStatus.dispatch)} />
                  </div>
                  <div className="adapterCapabilityGrid">
                    <AdapterCapability label="detect" state={selectedAdapterStatus.detect} />
                    <AdapterCapability label="listPersonas" state={selectedAdapterStatus.list_personas} />
                    <AdapterCapability label="dispatch" state={selectedAdapterStatus.dispatch} />
                    <AdapterCapability label="cancel" state={selectedAdapterStatus.cancel} />
                    <AdapterCapability label="sessionStatus" state={selectedAdapterStatus.session_status} />
                  </div>
                </section>
              ) : null}

              <div className="assetEditorGrid">
                <section className="assetEditorPanel">
                  <h3>Runtime 路径</h3>
                  <p>检测不到命令时，可以先手动写入本机可执行文件路径；后续扫描会继续读取 PATH。</p>
                  <div className="fieldStack">
                    <label>
                      <span>{selectedConfigRuntime?.name ?? 'Runtime'} 路径</span>
                      <input
                        value={selectedRuntimePath}
                        onChange={(event) => setRuntimePathDrafts((current) => ({
                          ...current,
                          [selectedRuntimeId]: event.target.value,
                        }))}
                        placeholder="例如 D:\Node\claude.cmd"
                      />
                    </label>
                  </div>
                  <button disabled={assetSaveState === 'saving' || !selectedRuntimeId} onClick={() => void saveRuntimePath()}>
                    保存 Runtime 路径
                  </button>
                </section>

                <section className="assetEditorPanel">
                  <h3>编辑当前 Persona/Profile</h3>
                  <p>用于维护 Hermes profile、OpenClaw 内部 Agent 身份，以及 Claude Code / Codex 的默认身份说明。</p>
                  <div className="fieldStack">
                    <label>
                      <span>所属 Runtime</span>
                      <select value={personaEditDraft.runtimeId} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, runtimeId: event.target.value }))}>
                        {Object.values(config.runtimes).map((runtime) => (
                          <option key={runtime.id} value={runtime.id}>{runtime.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>名称</span>
                      <input value={personaEditDraft.name} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label>
                      <span>Profile Key</span>
                      <input value={personaEditDraft.profileKey} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, profileKey: event.target.value }))} />
                    </label>
                    <label>
                      <span>说明</span>
                      <textarea rows={3} value={personaEditDraft.description} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <label>
                      <span>Capabilities</span>
                      <input value={personaEditDraft.capabilities} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, capabilities: event.target.value }))} />
                    </label>
                    <label>
                      <span>Skills</span>
                      <input value={personaEditDraft.skills} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, skills: event.target.value }))} />
                    </label>
                    <label>
                      <span>MCP 绑定</span>
                      <input value={personaEditDraft.mcpBindings} onChange={(event) => setPersonaEditDraft((current) => ({ ...current, mcpBindings: event.target.value }))} />
                    </label>
                  </div>
                  <div className="assetActionRow">
                    <button disabled={assetSaveState === 'saving' || !personaEditDraft.name.trim()} onClick={() => void saveSelectedPersona()}>
                      保存 Persona
                    </button>
                    <button className="secondaryButton" disabled={assetSaveState === 'saving'} onClick={() => void toggleSelectedPersonaEnabled()}>
                      {selectedPersona.enabled === false ? '启用 Persona' : '禁用 Persona'}
                    </button>
                    <button className="dangerButton" disabled={assetSaveState === 'saving' || selectedPersonaInUse} onClick={() => void deleteSelectedPersona()}>
                      删除 Persona
                    </button>
                  </div>
                  {selectedPersonaInUse ? <small className="mutedText">此 Persona 已加入办公室，不能删除；可以先禁用，或到办公室详情中移除成员。</small> : null}
                </section>

                <section className="assetEditorPanel">
                  <h3>新增 Persona/Profile</h3>
                  <p>OpenClaw 多 Agent、Hermes profile 先允许手动维护，后续再交给 Adapter 自动发现。</p>
                  <div className="fieldStack">
                    <label>
                      <span>所属 Runtime</span>
                      <select value={personaDraft.runtimeId} onChange={(event) => setPersonaDraft((current) => ({ ...current, runtimeId: event.target.value }))}>
                        {Object.values(config.runtimes).map((runtime) => (
                          <option key={runtime.id} value={runtime.id}>{runtime.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>名称</span>
                      <input value={personaDraft.name} onChange={(event) => setPersonaDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 CoCo / 花卷 / feishu-dev" />
                    </label>
                    <label>
                      <span>Profile Key</span>
                      <input value={personaDraft.profileKey} onChange={(event) => setPersonaDraft((current) => ({ ...current, profileKey: event.target.value }))} placeholder="可选，留空自动生成" />
                    </label>
                    <label>
                      <span>说明</span>
                      <textarea rows={3} value={personaDraft.description} onChange={(event) => setPersonaDraft((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <label>
                      <span>Capabilities</span>
                      <input value={personaDraft.capabilities} onChange={(event) => setPersonaDraft((current) => ({ ...current, capabilities: event.target.value }))} placeholder="逗号分隔，如 code.review, repo.inspect" />
                    </label>
                    <label>
                      <span>Skills</span>
                      <input value={personaDraft.skills} onChange={(event) => setPersonaDraft((current) => ({ ...current, skills: event.target.value }))} placeholder="逗号分隔" />
                    </label>
                    <label>
                      <span>MCP 绑定</span>
                      <input value={personaDraft.mcpBindings} onChange={(event) => setPersonaDraft((current) => ({ ...current, mcpBindings: event.target.value }))} placeholder="逗号分隔，如 mcp_agent_mesh" />
                    </label>
                  </div>
                  <button disabled={assetSaveState === 'saving' || !personaDraft.name.trim()} onClick={() => void addPersona()}>
                    添加 Persona/Profile
                  </button>
                </section>
              </div>

              {assetSaveState === 'saved' ? <div className="saveNotice">资产配置已保存。</div> : null}
              {assetSaveState === 'failed' ? <div className="saveNotice error">{assetSaveError ?? '保存失败'}</div> : null}

              <div className="agentDetailFooter">
                <a className="officialLink" href={runtimeCatalog[runtimeKindOf(selectedPersona)].officialSite} rel="noreferrer" target="_blank">
                  {t('agents.officialSite')}
                </a>
                <button>{t('agents.useInOffice')}</button>
              </div>
            </>
          ) : (
            <div className="emptyOffice">尚未加载 Persona/Profile。</div>
          )}
        </section>
      </section>
    </>
  )
}

function TasksPage({ t }: { t: Translator }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Record<string, unknown> | null>(null)
  const [selectedTaskSession, setSelectedTaskSession] = useState<TaskSessionStatus | null>(null)
  const [logs, setLogs] = useState<LogTail[]>([])
  const [taskActionState, setTaskActionState] = useState<'idle' | 'cancelling' | 'retrying' | 'resetting' | 'failed'>('idle')
  const [taskActionError, setTaskActionError] = useState<string | null>(null)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
  const taskHealth = selectedTask ? getTaskHealth(selectedTask, selectedTaskDetail, logs) : null
  const diagnosticRows = selectedTaskDetail ? getTaskDiagnostics(selectedTaskDetail) : []
  const selectedTaskTerminal = selectedTask ? ['completed', 'failed', 'cancelled'].includes(selectedTask.status) : false

  async function refreshTasks() {
    const nextTasks = await agentMeshApi.listTasks()
    setTasks(nextTasks)
    setSelectedTaskId((current) => current || nextTasks[0]?.id || '')
  }

  useEffect(() => {
    void refreshTasks()
  }, [])

  useEffect(() => {
    if (!selectedTask?.id) {
      setSelectedTaskDetail(null)
      setSelectedTaskSession(null)
      setLogs([])
      return
    }

    void Promise.all([
      agentMeshApi.getTaskDetail(selectedTask.id),
      agentMeshApi.getTaskLogTail(selectedTask.id),
      agentMeshApi.getTaskSessionStatus(selectedTask.id),
    ]).then(([detail, nextLogs, session]) => {
      setSelectedTaskDetail(detail)
      setLogs(nextLogs)
      setSelectedTaskSession(session)
    })
  }, [selectedTask?.id])

  async function cancelSelectedTask() {
    if (!selectedTask || selectedTaskTerminal) return

    setTaskActionState('cancelling')
    setTaskActionError(null)
    try {
      await agentMeshApi.cancelTask(selectedTask.id)
      await refreshTasks()
      setTaskActionState('idle')
    } catch (error) {
      setTaskActionState('failed')
      setTaskActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function retrySelectedTask() {
    if (!selectedTask) return

    setTaskActionState('resetting')
    setTaskActionError(null)
    try {
      const retry = await agentMeshApi.retryTask(selectedTask.id)
      await refreshTasks()
      setSelectedTaskId(retry.id)
      setTaskActionState('idle')
    } catch (error) {
      setTaskActionState('failed')
      setTaskActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function resetSelectedSession() {
    if (!selectedTask) return

    setTaskActionState('retrying')
    setTaskActionError(null)
    try {
      const session = await agentMeshApi.resetTaskSession(selectedTask.id)
      const detail = await agentMeshApi.getTaskDetail(selectedTask.id)
      setSelectedTaskSession(session)
      setSelectedTaskDetail(detail)
      setTaskActionState('idle')
    } catch (error) {
      setTaskActionState('failed')
      setTaskActionError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="breadcrumb">DASHBOARD / TASKS</div>
          <h1>{t('tasks.title')}</h1>
          <p>{t('tasks.description')}</p>
        </div>
        <div className="actions">
          <button onClick={() => void refreshTasks()}>{t('actions.refresh')}</button>
        </div>
      </header>

      <section className="taskWorkbench">
        <Panel title={t('tasks.recentTitle')}>
          <div className="taskTable">
            {tasks.length > 0 ? tasks.map((task) => (
              <button
                className={selectedTask?.id === task.id ? 'taskTableRow selected cleanTaskRow' : 'taskTableRow cleanTaskRow'}
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <span className="monoText">#{task.id}</span>
                <strong>{task.objective}</strong>
                <span>{task.agent}</span>
                <span>{task.agent_type}</span>
                <Status value={task.status} label={t(`status.${task.status}`)} />
                <span className="monoText">{formatDate(task.updated_at)}</span>
              </button>
            )) : (
              <div className="emptyOffice">暂未发现 `.agent-mesh/tasks` 任务记录。</div>
            )}
          </div>
        </Panel>
        <aside className="taskDrawer">
          {selectedTask ? (
            <>
              <div className="drawerHeader">
                <div>
                  <h2>{t('tasks.detailTitle')}</h2>
                  <p className="monoText">#{selectedTask.id}</p>
                </div>
                <Status value={selectedTask.status} label={t(`status.${selectedTask.status}`)} />
              </div>
              <div className="drawerSection">
                <h3>{t('tasks.runtimeLogTitle')}</h3>
                <div className="logPreview tall">
                  {logs.flatMap((log) => log.lines.map((line) => `${shortFileName(log.path)} ${line}`)).slice(-80).map((line, index) => (
                    <span key={`${index}-${line}`}>{line}</span>
                  ))}
                </div>
              </div>
              <div className="drawerStats">
                <div>
                  <small>Workspace</small>
                  <strong>{selectedTask.workspace_path ? shortPath(selectedTask.workspace_path) : '-'}</strong>
                </div>
                <div>
                  <small>Updated</small>
                  <strong>{formatDate(selectedTask.updated_at)}</strong>
                </div>
                <div>
                  <small>Health</small>
                  <strong>{taskHealth?.label ?? '-'}</strong>
                </div>
                <div>
                  <small>Last event</small>
                  <strong>{taskHealth ? formatDate(taskHealth.lastActivityAt) : '-'}</strong>
                </div>
              </div>
              {taskHealth ? (
                <div className={`taskHealthBanner ${taskHealth.tone}`}>
                  <strong>{taskHealth.title}</strong>
                  <span>{taskHealth.description}</span>
                </div>
              ) : null}
              <div className="drawerSection">
                <h3>结果与诊断</h3>
                <div className="logPreview">
                  <span>{extractResultSummary(selectedTaskDetail)}</span>
                </div>
              </div>
              <div className="drawerSection">
                <h3>失败诊断</h3>
                <div className="diagnosticGrid">
                  {diagnosticRows.length > 0 ? diagnosticRows.map((row) => (
                    <div key={row.label}>
                      <small>{row.label}</small>
                      <code>{row.value}</code>
                    </div>
                  )) : (
                    <div>
                      <small>diagnostic</small>
                      <code>暂无失败诊断。任务完成或失败后会显示 raw command / exitCode / stderr。</code>
                    </div>
                  )}
                </div>
              </div>
              <div className="drawerSection">
                <h3>Session 状态</h3>
                <div className="sessionStatusPanel">
                  <div>
                    <small>Status</small>
                    <strong>{selectedTaskSession?.status ?? 'unknown'}</strong>
                  </div>
                  <div>
                    <small>Runtime Session</small>
                    <code>{selectedTaskSession?.runtime_session_id ?? 'not captured'}</code>
                  </div>
                  <div>
                    <small>Runtime</small>
                    <code>{selectedTaskSession?.runtime_id ?? '-'}</code>
                  </div>
                  <div>
                    <small>Updated</small>
                    <code>{formatDate(selectedTaskSession?.updated_at)}</code>
                  </div>
                </div>
              </div>
              <div className="drawerActions">
                <button className="dangerButton" disabled={selectedTaskTerminal || taskActionState === 'cancelling'} onClick={() => void cancelSelectedTask()}>
                  {taskActionState === 'cancelling' ? '取消中' : t('tasks.stopTask')}
                </button>
                <button className="secondaryButton" disabled={taskActionState === 'retrying'} onClick={() => void retrySelectedTask()}>
                  {taskActionState === 'retrying' ? '重试中' : t('tasks.restartTask')}
                </button>
                <button className="secondaryButton" disabled={taskActionState === 'resetting'} onClick={() => void resetSelectedSession()}>
                  {taskActionState === 'resetting' ? '重置中' : '重置 Session'}
                </button>
              </div>
              {taskActionState === 'failed' ? <div className="saveNotice error taskActionError">{taskActionError ?? '任务操作失败'}</div> : null}
            </>
          ) : (
            <div className="emptyOffice">请选择一个任务查看详情。</div>
          )}
        </aside>
      </section>
    </>
  )
}

function SettingsPage({
  locale,
  selectedHomeAgents,
  setLocale,
  setSelectedHomeAgents,
  setTheme,
  t,
  theme,
}: {
  locale: Locale
  selectedHomeAgents: RuntimeKind[]
  setLocale: (locale: Locale) => void
  setSelectedHomeAgents: Dispatch<SetStateAction<RuntimeKind[]>>
  setTheme: (theme: ThemeMode) => void
  t: Translator
  theme: ThemeMode
}) {
  return (
    <section className="settingsPanel">
      <SectionHeader title={t('settings.title')} description={t('settings.description')} />

      <SettingBlock title={t('settings.languageTitle')} description={t('settings.languageDescription')}>
        <SegmentedControl
          value={locale}
          options={[
            ['zh', t('language.zh')],
            ['en', t('language.en')],
            ['ja', t('language.ja')],
          ]}
          onChange={(value) => setLocale(value as Locale)}
        />
      </SettingBlock>

      <SettingBlock title={t('settings.themeTitle')} description={t('settings.themeDescription')}>
        <SegmentedControl
          value={theme}
          options={[
            ['light', t('theme.light')],
            ['dark', t('theme.dark')],
            ['system', t('theme.system')],
          ]}
          onChange={(value) => setTheme(value as ThemeMode)}
        />
      </SettingBlock>

      <SettingBlock title={t('settings.homeAgentsTitle')} description={t('settings.homeAgentsDescription')}>
        <div className="agentToggles">
          {defaultHomeAgents.map((agentId) => {
            const selected = selectedHomeAgents.includes(agentId)
            return (
              <button
                className={selected ? 'toggle selected' : 'toggle'}
                key={agentId}
                onClick={() => {
                  setSelectedHomeAgents((current) => (
                    current.includes(agentId)
                      ? current.filter((item) => item !== agentId)
                      : [...current, agentId]
                  ))
                }}
              >
                <AgentLogo kind={agentId} compact />
                {runtimeCatalog[agentId].name}
              </button>
            )
          })}
        </div>
      </SettingBlock>
    </section>
  )
}

function OfficeMemberRow({ persona, roleLabel }: { persona: Persona; roleLabel: string }) {
  return (
    <div className="nodeRow">
      <AgentLogo kind={runtimeKindOf(persona)} compact />
      <div>
        <strong>{persona.runtime?.name ?? persona.runtime_id} / {persona.name}</strong>
        <small>{(persona.capabilities ?? []).slice(0, 2).join(' / ') || persona.profile_key || persona.id}</small>
      </div>
      <Status value="available" label="Persona" />
      <span className="roleLabel">{roleLabel}</span>
    </div>
  )
}

function AgentLogo({ compact = false, kind }: { compact?: boolean; kind: RuntimeKind }) {
  const agent = runtimeCatalog[kind]
  return (
    <span className={compact ? 'agentLogo compact' : 'agentLogo'}>
      <img
        alt=""
        src={agent.logoUrl}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
      <span>{agent.fallback}</span>
    </span>
  )
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      <div className="inlineList">
        {items.length > 0 ? items.map((item) => <span key={item}>{item}</span>) : <span>暂无配置</span>}
      </div>
    </section>
  )
}

function AdapterCapability({ label, state }: { label: string; state: AdapterCapabilityState }) {
  return (
    <div className={`adapterCapability ${state}`}>
      <small>{label}</small>
      <strong>{adapterStateLabel(state)}</strong>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function adapterStateLabel(state: AdapterCapabilityState) {
  const labels: Record<AdapterCapabilityState, string> = {
    default: '默认身份',
    implemented: '已接入',
    manual: '手动维护',
    planned: '待验证',
    verified: '已验证',
  }

  return labels[state]
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="sectionHeader">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

function SettingBlock({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="settingBlock">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </section>
  )
}

function SegmentedControl({ value, options, onChange }: {
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button
          className={value === optionValue ? 'selected' : ''}
          key={optionValue}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Status({ value, label }: { value: string; label: string }) {
  return <span className={`status ${value}`}>{label}</span>
}

function MetricBar({ label, tone = 'primary', value, width }: { label: string; tone?: 'primary' | 'success'; value: string; width: string }) {
  return (
    <div className="metricBar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="meter">
        <span className={tone} style={{ width }} />
      </div>
    </div>
  )
}

function runtimeKindOf(persona: Persona): RuntimeKind {
  return persona.runtime?.kind ?? runtimeIdToKind(persona.runtime_id)
}

function runtimeKindOfMember(member: OfficeMember): RuntimeKind {
  return member.runtime?.kind ?? runtimeIdToKind(member.persona?.runtime_id ?? member.persona_id)
}

function stripJoinedOffice(office: Office): Office {
  const { channels: _channels, members: _members, ...rest } = office
  return rest
}

function stripJoinedOfficeMember(member: OfficeMember): OfficeMember {
  const { persona: _persona, runtime: _runtime, ...rest } = member
  return rest
}

function emptyChannel(office: Office): Channel {
  return {
    id: `channel_${office.id}_chat`,
    type: 'agent-mesh-chat',
    name: 'Agent Mesh Chat',
    office_id: office.id,
    enabled: true,
  }
}

function emptyPolicy(office: Office): PermissionPolicy {
  return {
    id: office.default_permission_policy_id ?? `policy_${office.id}_safe`,
    name: `${office.name} 安全策略`,
    default_mode: 'safe-write',
    require_confirmation: ['run_destructive_command'],
    allowed_channels: ['agent-mesh-chat', 'cli'],
    allowed_runtime_kinds: ['hermes', 'openclaw', 'codex', 'claude-code'],
  }
}

function emptyTaskType(office: Office): TaskType {
  return {
    id: office.default_task_type_id ?? `task_type_${office.id}_default`,
    name: '默认任务',
    description: '这个办公室默认接收的任务类型。',
    required_capabilities: [],
    default_acceptance: ['说明执行结果'],
    default_constraints: ['遵守办公室权限策略'],
    enabled: true,
  }
}

function emptyRoutingPolicy(office: Office): RoutingPolicy {
  return {
    id: office.default_routing_policy_id ?? `routing_${office.id}_default`,
    name: '默认路由策略',
    office_id: office.id,
    task_type_id: office.default_task_type_id,
    strategy: 'capability-match',
    preferred_member_ids: [],
    required_capabilities: [],
    enabled: true,
  }
}

function runtimeIdToKind(runtimeId: string): RuntimeKind {
  if (runtimeId.includes('openclaw')) return 'openclaw'
  if (runtimeId.includes('codex')) return 'codex'
  if (runtimeId.includes('claude')) return 'claude-code'
  return 'hermes'
}

function runtimeOf(persona: Persona, detections: RuntimeAsset[], config: AgentMeshConfig): RuntimeAsset | undefined {
  const configRuntime = persona.runtime ?? config.runtimes[persona.runtime_id]
  const detected = detections.find((runtime) => runtime.kind === configRuntime?.kind)
  return detected ? { ...configRuntime, ...detected, id: configRuntime?.id ?? detected.id } : configRuntime
}

function runtimeStatusOf(persona: Persona, detections: RuntimeAsset[]): RuntimeStatus {
  return detectedRuntimeStatus({ id: persona.runtime_id, kind: runtimeKindOf(persona), name: persona.runtime_id, connection_type: 'cli' }, detections)
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

function detectedRuntimeStatus(runtime: RuntimeAsset, detections: RuntimeAsset[]): RuntimeStatus {
  const detected = detections.find((item) => item.kind === runtime.kind)
  return detected?.status ?? (runtime.installed ? 'available' : 'unknown')
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function shortFileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}

function shortPath(path: string) {
  const parts = path.split(/[\\/]/)
  return parts.slice(-2).join('\\')
}

function extractResultSummary(detail: Record<string, unknown> | null) {
  const result = detail?.result
  if (typeof result === 'object' && result !== null && 'summary' in result) {
    const summary = (result as { summary?: unknown }).summary
    return typeof summary === 'string' && summary.trim() ? summary : '结果中没有 summary 字段。'
  }
  return '暂未记录结果。'
}

function getTaskHealth(task: TaskSummary, detail: Record<string, unknown> | null, logs: LogTail[]) {
  const lastActivityAt = getLastTaskActivity(task, detail, logs)
  const ageMs = lastActivityAt ? Date.now() - new Date(lastActivityAt).getTime() : Number.POSITIVE_INFINITY
  const stale = task.status === 'running' && ageMs > 120_000

  if (stale) {
    return {
      description: 'running 任务超过 120 秒没有新的事件或日志，建议检查进程是否仍在运行。',
      label: 'stale',
      lastActivityAt,
      title: '可能已停滞',
      tone: 'warning',
    }
  }

  if (task.status === 'running') {
    return {
      description: '最近仍有事件或日志，任务看起来还在执行。',
      label: 'active',
      lastActivityAt,
      title: '运行中',
      tone: 'success',
    }
  }

  if (task.status === 'failed') {
    return {
      description: '任务失败，请查看下方 raw diagnostic、stderr 和命令信息。',
      label: 'failed',
      lastActivityAt,
      title: '执行失败',
      tone: 'danger',
    }
  }

  return {
    description: '任务当前没有检测到停滞风险。',
    label: task.status,
    lastActivityAt,
    title: '状态正常',
    tone: task.status === 'completed' ? 'success' : 'neutral',
  }
}

function getLastTaskActivity(task: TaskSummary, detail: Record<string, unknown> | null, logs: LogTail[]) {
  const eventTimes = Array.isArray(detail?.events)
    ? detail.events
      .map((event) => typeof event === 'object' && event !== null && 'at' in event ? (event as { at?: unknown }).at : undefined)
      .filter((value): value is string => typeof value === 'string')
    : []
  const newestLogTime = logs
    .map((log) => extractNewestIsoTimestamp(log.lines.join('\n')))
    .filter((value): value is string => Boolean(value))
  const candidates = [task.updated_at, ...eventTimes, ...newestLogTime]
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())

  return candidates[0] ?? task.updated_at ?? task.created_at
}

function extractNewestIsoTimestamp(text: string) {
  const matches = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g)
  return matches?.at(-1)
}

function getTaskDiagnostics(detail: Record<string, unknown>) {
  const raw = getResultRaw(detail)
  if (!raw) return []

  return [
    ['exitCode', raw.exitCode],
    ['command', raw.command],
    ['args', Array.isArray(raw.args) ? raw.args.join(' ') : raw.args],
    ['cwd', raw.cwd],
    ['stderr', trimDiagnostic(raw.stderr)],
    ['stdout', trimDiagnostic(raw.stdout)],
  ]
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label: String(label), value: String(value) }))
}

function getResultRaw(detail: Record<string, unknown>) {
  const result = detail.result
  if (typeof result !== 'object' || result === null || !('raw' in result)) return null
  const raw = (result as { raw?: unknown }).raw
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null
}

function trimDiagnostic(value: unknown) {
  if (typeof value !== 'string') return value
  const compact = value.trim()
  return compact.length > 1200 ? `${compact.slice(0, 1200)}...` : compact
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '') || 'office'
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M20 6v5h-5M4 18v-5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M18.5 9A7 7 0 0 0 6.6 5.8L4 8.2M5.5 15A7 7 0 0 0 17.4 18.2L20 15.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path d="m8 10 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  )
}

function PersonaIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  )
}

function OfficeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="M4 20V8l8-4 8 4v12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 20v-6h6v6M8 10h.01M12 10h.01M16 10h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

export default App
