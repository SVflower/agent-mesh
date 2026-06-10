import { useEffect, useMemo, useState } from 'react'
import { AgentLogo, Status } from '../../components/common'
import type { RuntimeScanState } from '../../hooks/useAgentMeshBootstrap'
import { agentMeshApi } from '../../services/agentMeshApi'
import type { AdapterCapabilityState, AgentMeshConfig, LocalAgentInventoryItem, Persona, RuntimeAdapterStatus, RuntimeAsset, RuntimeKind } from '../../types/agentMesh'
import { displayRuntimeName } from '../../utils/displayNames'

type Translator = (key: string) => string

const runtimeOrder: RuntimeKind[] = ['hermes', 'codex', 'claude-code', 'openclaw']
const capabilityOptions = ['repo.inspect', 'code.review', 'summary.write', 'file.read', 'shell.exec', 'browser.operate']

const installGuides: Record<RuntimeKind, string[]> = {
  hermes: ['npm install -g @anthropic/hermes', 'hermes init'],
  codex: ['npm install -g @openai/codex', 'codex login'],
  'claude-code': ['npm install -g @anthropic-ai/claude-code', 'claude login'],
  openclaw: ['安装 OpenClaw Desktop', '在 OpenClaw 中启用本地 Agent 发现', '返回 Agent Mesh 执行检测本地 Agent'],
}

export function AgentsPage({
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
  const [inventory, setInventory] = useState<LocalAgentInventoryItem[]>([])
  const [inventoryState, setInventoryState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [guideRuntime, setGuideRuntime] = useState<RuntimeKind | null>(null)
  const [personaModalOpen, setPersonaModalOpen] = useState(false)
  const [draft, setDraft] = useState({ runtimeId: '', name: '', description: '', capabilities: ['repo.inspect'] })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [openClawExpanded, setOpenClawExpanded] = useState(true)

  useEffect(() => {
    setInventoryState('loading')
    void agentMeshApi.discoverLocalAgents()
      .then((next) => {
        setInventory(next)
        setInventoryState('ready')
      })
      .catch(() => {
        setInventory([])
        setInventoryState('failed')
      })
  }, [config.personas, config.officeMembers])

  useEffect(() => {
    if (!draft.runtimeId) {
      setDraft((current) => ({ ...current, runtimeId: Object.values(config.runtimes)[0]?.id ?? '' }))
    }
  }, [config.runtimes, draft.runtimeId])

  const columns = useMemo(() => runtimeOrder.map((kind) => {
    const runtime = Object.values(config.runtimes).find((item) => item.kind === kind)
    const detected = runtimeAssets.find((item) => item.kind === kind)
    const runtimePersonas = personas.filter((persona) => config.runtimes[persona.runtime_id]?.kind === kind)
    const adapter = adapterStatuses.find((item) => item.runtime_kind === kind)
    return { adapter, detected, kind, personas: runtimePersonas, runtime }
  }), [adapterStatuses, config.runtimes, personas, runtimeAssets])

  async function savePersona() {
    const runtime = config.runtimes[draft.runtimeId]
    if (!runtime || !draft.name.trim()) {
      setSaveError('请选择 Runtime 并填写 Persona 名称。')
      return
    }

    const id = `persona_${runtime.kind}_${slugify(draft.name)}_${Date.now()}`
    const nextConfig: AgentMeshConfig = {
      ...config,
      personas: {
        ...config.personas,
        [id]: {
          id,
          runtime_id: runtime.id,
          name: draft.name.trim(),
          description: draft.description.trim(),
          capabilities: draft.capabilities,
          enabled: true,
          source: 'custom',
        },
      },
    }

    setSaveError(null)
    try {
      await agentMeshApi.saveConfig(nextConfig)
      await onConfigSaved()
      setPersonaModalOpen(false)
      setDraft({ runtimeId: runtime.id, name: '', description: '', capabilities: ['repo.inspect'] })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="agentsPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">AGENT ASSETS</p>
          <h1>{t('agents.title')}</h1>
          <p>检测本机 Runtime，盘点 Persona/Profile，并明确哪些 Agent 已加入办公室。</p>
        </div>
        <button onClick={onRescan}>{scanState === 'scanning' ? '检测中...' : '检测本地 Agent'}</button>
      </header>

      {scanError ? <div className="errorNotice"><strong>Runtime 扫描失败</strong><button onClick={onRescan}>重试</button><span>{scanError}</span></div> : null}
      {inventoryState === 'loading' ? <SkeletonGrid /> : null}
      {inventoryState === 'failed' ? <div className="errorNotice"><strong>Agent 资产加载失败</strong><span>无法读取本地 Agent 清单。</span></div> : null}

      {inventoryState !== 'loading' ? (
        <section className="runtimeColumns">
          {columns.map(({ adapter, detected, kind, personas: runtimePersonas, runtime }) => {
            const openClawChildren = inventory.filter((item) => item.runtime_kind === 'openclaw')
            return (
              <article className={`runtimeColumn ${kind === 'openclaw' ? 'openClawColumn' : ''}`} key={kind}>
                <div className="runtimeColumnHead">
                  <div className="runtimeIdentity">
                    <AgentLogo kind={kind} />
                    <div>
                      <h2>{runtime?.name ?? displayRuntimeName(kind)}</h2>
                      <small>{runtime?.connection_type ?? (kind === 'openclaw' ? 'desktop' : 'cli')}</small>
                    </div>
                  </div>
                  <div className="runtimeBadges">
                    {kind === 'openclaw' ? <span className="multiAgentBadge">多 Agent</span> : null}
                    <Status value={detected?.installed ? 'available' : 'missing'} label={detected?.installed ? '已安装' : '未安装'} />
                  </div>
                </div>

                <div className="runtimePathBox">
                  <small>CLI / APP 路径</small>
                  <code>{detected?.executable_path ?? runtime?.command ?? 'not detected'}</code>
                  <span>{detected?.version ?? runtime?.health ?? 'unknown'}</span>
                </div>

                <div className="personaRows">
                  {runtimePersonas.map((persona) => {
                    const item = inventory.find((row) => row.persona_id === persona.id)
                    return (
                      <div className="personaAssetRow" key={persona.id}>
                        <span>{persona.name.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{persona.name}</strong>
                          <small>{persona.profile_key ?? persona.source ?? 'default'}</small>
                        </div>
                        <Status value={item?.status ?? 'manual'} label={assetStatusLabel(item?.status ?? 'manual')} />
                      </div>
                    )
                  })}
                  {runtimePersonas.length === 0 ? <div className="emptyState">暂无 Persona。</div> : null}
                </div>

                {kind === 'openclaw' ? (
                  <div className="openClawTree">
                    <button className="treeRoot" onClick={() => setOpenClawExpanded((current) => !current)}>
                      <strong>OpenClaw Runtime</strong>
                      <span>{openClawExpanded ? '收起' : '展开'}</span>
                    </button>
                    {openClawExpanded ? (
                      <div className="treeChildren">
                        {(openClawChildren.length > 0 ? openClawChildren : runtimePersonas.map((persona) => ({
                          name: persona.name,
                          status: 'manual' as const,
                          diagnostic: persona.description ?? '配置中的 OpenClaw Persona',
                          runtime_id: persona.runtime_id,
                          runtime_kind: 'openclaw',
                          runtime_name: 'OpenClaw',
                          source: 'config',
                          in_offices: [],
                        }))).map((item) => (
                          <div className="treeChild" key={`${item.runtime_id}-${item.name}`}>
                            <i className={`healthDot ${item.status === 'unavailable' ? 'warn' : 'ok'}`} />
                            <span>{item.name}</span>
                            <small>{assetStatusLabel(item.status)}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="adapterMiniGrid">
                  <AdapterPill label="detect" state={adapter?.detect ?? 'planned'} />
                  <AdapterPill label="list_personas" state={adapter?.list_personas ?? 'planned'} />
                  <AdapterPill label="dispatch" state={adapter?.dispatch ?? 'planned'} />
                  <AdapterPill label="cancel" state={adapter?.cancel ?? 'planned'} />
                  <AdapterPill label="session" state={adapter?.session_status ?? 'planned'} />
                </div>

                {!detected?.installed ? <button className="installLink" onClick={() => setGuideRuntime(kind)}>查看安装引导</button> : null}
              </article>
            )
          })}
        </section>
      ) : null}

      <footer className="agentAssetFooter">
        <button onClick={() => setPersonaModalOpen(true)}>添加自定义 Persona</button>
        <span>当前共 {personas.length} 个 Persona/Profile，{inventory.filter((item) => item.status === 'managed').length} 个已加入办公室。</span>
      </footer>

      {guideRuntime ? (
        <aside className="sideDrawer">
          <div className="drawerHeader compactHeader">
            <div>
              <p className="eyebrow">INSTALL GUIDE</p>
              <h2>{displayRuntimeName(guideRuntime)} 安装引导</h2>
            </div>
            <button className="secondaryButton" onClick={() => setGuideRuntime(null)}>关闭</button>
          </div>
          <ol className="installSteps">
            {installGuides[guideRuntime].map((step) => <li key={step}><code>{step}</code></li>)}
          </ol>
        </aside>
      ) : null}

      {personaModalOpen ? (
        <div className="modalBackdrop" onClick={() => setPersonaModalOpen(false)}>
          <section className="modalPanel" onClick={(event) => event.stopPropagation()}>
            <div className="drawerHeader compactHeader">
              <div>
                <p className="eyebrow">CUSTOM PERSONA</p>
                <h2>添加自定义 Persona</h2>
              </div>
              <button className="secondaryButton" onClick={() => setPersonaModalOpen(false)}>关闭</button>
            </div>
            <div className="officeEditGrid compact">
              <label>
                <span>Runtime</span>
                <select value={draft.runtimeId} onChange={(event) => setDraft((current) => ({ ...current, runtimeId: event.target.value }))}>
                  {Object.values(config.runtimes).map((runtime) => <option key={runtime.id} value={runtime.id}>{displayRuntimeName(runtime.kind)} / {runtime.name}</option>)}
                </select>
              </label>
              <label>
                <span>Persona 名称</span>
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>描述</span>
                <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <div className="capabilityTags">
                {capabilityOptions.map((capability) => (
                  <button
                    className={draft.capabilities.includes(capability) ? 'selected' : ''}
                    key={capability}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      capabilities: current.capabilities.includes(capability)
                        ? current.capabilities.filter((item) => item !== capability)
                        : [...current.capabilities, capability],
                    }))}
                  >
                    {capability}
                  </button>
                ))}
              </div>
              {saveError ? <div className="errorNotice compact"><strong>保存失败</strong><span>{saveError}</span></div> : null}
              <button onClick={() => void savePersona()}>保存 Persona</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="runtimeColumns">
      {[0, 1, 2, 3].map((item) => <div className="skeletonCard tall" key={item} />)}
    </div>
  )
}

function AdapterPill({ label, state }: { label: string; state: AdapterCapabilityState }) {
  return (
    <div className={`adapterPill ${state}`}>
      <small>{label}</small>
      <strong>{adapterStateLabel(state)}</strong>
    </div>
  )
}

function adapterStateLabel(state: AdapterCapabilityState) {
  if (state === 'verified') return '已验证'
  if (state === 'implemented') return '已接入'
  if (state === 'manual') return '手动维护'
  if (state === 'default') return '默认'
  return '待验证'
}

function assetStatusLabel(status: LocalAgentInventoryItem['status']) {
  if (status === 'managed') return '已入组'
  if (status === 'discovered') return '已发现'
  if (status === 'unverified') return '待验证'
  if (status === 'unavailable') return '不可用'
  return '手动'
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '') || 'persona'
}
