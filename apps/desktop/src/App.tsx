import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { useAgentMeshBootstrap } from './hooks/useAgentMeshBootstrap'
import { useI18n } from './i18n'
import { AgentsPage } from './pages/agents'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { OfficeCreatePage, OfficeDetailPage, OfficesPage } from './pages/offices'
import { ChatPage } from './pages/chat'
import { SettingsPage } from './pages/settings'
import { TasksPage } from './pages/tasks'
import type { PermissionMode, RuntimeKind } from './types/agentMesh'

type PageId = 'dashboard' | 'offices' | 'office-create' | 'office-detail' | 'agents' | 'tasks' | 'chat' | 'settings'
type ThemeMode = 'light' | 'dark' | 'system'
type OfficeDraft = {
  name: string
  description: string
  primaryPersonaId: string
  collaboratorPersonaIds: string[]
  permissionMode: PermissionMode
  channelType: 'agent-mesh-chat' | 'none'
}

const navItems: Array<[Extract<PageId, 'dashboard' | 'offices' | 'agents' | 'tasks' | 'chat'>, string, string]> = [
  ['dashboard', '仪表盘', 'dashboard'],
  ['offices', '办公室', 'building'],
  ['agents', 'Agent 资产', 'cpu'],
  ['tasks', '任务', 'workflow'],
  ['chat', 'Chat', 'message'],
]

const defaultHomeAgents: RuntimeKind[] = ['hermes', 'openclaw', 'claude-code', 'codex']

function App() {
  const { locale, setLocale, t } = useI18n()
  const [activePage, setActivePage] = useState<PageId>('dashboard')
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
    channelType: 'agent-mesh-chat',
  }), [personas])
  const [officeDraft, setOfficeDraft] = useState<OfficeDraft>(defaultOfficeDraft)

  useEffect(() => {
    setOfficeDraft(defaultOfficeDraft)
  }, [defaultOfficeDraft])

  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme
    root.dataset.theme = resolved
  }, [theme])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark"><NavIcon name="building" /></span>
          <div>
            <strong>{t('app.title')}</strong>
            <small>{t('app.subtitle')}</small>
          </div>
        </div>
        <nav>
          {navItems.map(([key, label, icon]) => (
            <button
              className={key === activePage || (key === 'offices' && (activePage === 'office-create' || activePage === 'office-detail')) ? 'active' : ''}
              key={key}
              onClick={() => setActivePage(key)}
              title={label}
            >
              <NavIcon name={icon} />
              <span>{label}</span>
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
        {activePage === 'dashboard' ? (
          <DashboardPage
            offices={offices}
            personas={personas}
            runtimeAssets={runtimeAssets}
            scanError={scanError}
            scanState={scanState}
            onCreateOffice={() => setActivePage('office-create')}
            onNewTask={() => setActivePage('tasks')}
            onRescan={rescanRuntimes}
          />
        ) : activePage === 'settings' ? (
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
          <TasksPage config={config} offices={offices} t={t} />
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
            t={t}
          />
        )}
      </main>
    </div>
  )
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string[]> = {
    dashboard: ['M4 5h7v7H4z', 'M13 5h7v4h-7z', 'M13 11h7v8h-7z', 'M4 14h7v5H4z'],
    building: ['M4 20V8l8-4 8 4v12', 'M9 20v-6h6v6', 'M8 10h.01M12 10h.01M16 10h.01'],
    cpu: ['M9 9h6v6H9z', 'M4 9h2M4 15h2M18 9h2M18 15h2M9 4v2M15 4v2M9 18v2M15 18v2', 'M7 7h10v10H7z'],
    workflow: ['M6 6h5v5H6z', 'M13 13h5v5h-5z', 'M11 8h3a3 3 0 0 1 3 3v2'],
    message: ['M5 6h14v9H8l-3 3z'],
  }
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      {(paths[name] ?? paths.dashboard).map((path) => (
        <path d={path} key={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      ))}
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

export default App
