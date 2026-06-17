import './App.css'
import './styles/app-shell.css'
import './styles/bootstrap.css'
import './styles/states.css'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react'
import { AppBootstrapScreen, AppShell } from './components/app/AppShell'
import { useAgentMeshBootstrap } from './hooks/useAgentMeshBootstrap'
import { useI18n } from './i18n'
import { AgentsPage } from './pages/agents'
import { ChatPage } from './pages/chat'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { OfficeCreatePage, OfficeDetailPage, OfficesPage } from './pages/offices'
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

const defaultHomeAgents: RuntimeKind[] = ['hermes', 'openclaw', 'claude-code', 'codex']

function App() {
  const { locale, setLocale, t } = useI18n()
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [selectedHomeAgents, setSelectedHomeAgents] = useState<RuntimeKind[]>(defaultHomeAgents)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const {
    adapterStatuses,
    bootstrapError,
    bootstrapState,
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
    description: '用于本机代码、文档和长期任务协作的办公室。',
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

  if (bootstrapState === 'loading') {
    return (
      <AppBootstrapScreen
        description={t('init.backgroundDescription')}
        state="loading"
        title={t('init.backgroundTitle')}
      />
    )
  }

  if (bootstrapState === 'error') {
    return (
      <AppBootstrapScreen
        actionLabel={t('actions.refresh')}
        description={bootstrapError ?? t('init.backgroundDescription')}
        onAction={() => window.location.reload()}
        state="error"
        title={t('init.errorTitle')}
      />
    )
  }

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
      settingsLabel={t('nav.settings')}
      subtitle={t('app.subtitle')}
      t={t}
      title={t('app.title')}
    >
      {renderPage({
        activePage,
        adapterStatuses,
        config,
        locale,
        officeDraft,
        offices,
        personas,
        refreshConfig,
        rescanRuntimes,
        runtimeAssets,
        scanError,
        scanState,
        selectedHomeAgents,
        selectedOfficeId,
        setActivePage,
        setLocale,
        setOfficeDraft,
        setSelectedHomeAgents,
        setSelectedOfficeId,
        setTheme,
        t,
        theme,
      })}
    </AppShell>
  )
}

function renderPage({
  activePage,
  adapterStatuses,
  config,
  locale,
  officeDraft,
  offices,
  personas,
  refreshConfig,
  rescanRuntimes,
  runtimeAssets,
  scanError,
  scanState,
  selectedHomeAgents,
  selectedOfficeId,
  setActivePage,
  setLocale,
  setOfficeDraft,
  setSelectedHomeAgents,
  setSelectedOfficeId,
  setTheme,
  t,
  theme,
}: {
  activePage: PageId
  adapterStatuses: ReturnType<typeof useAgentMeshBootstrap>['adapterStatuses']
  config: ReturnType<typeof useAgentMeshBootstrap>['config']
  locale: ReturnType<typeof useI18n>['locale']
  officeDraft: OfficeDraft
  offices: ReturnType<typeof useAgentMeshBootstrap>['offices']
  personas: ReturnType<typeof useAgentMeshBootstrap>['personas']
  refreshConfig: ReturnType<typeof useAgentMeshBootstrap>['refreshConfig']
  rescanRuntimes: ReturnType<typeof useAgentMeshBootstrap>['rescanRuntimes']
  runtimeAssets: ReturnType<typeof useAgentMeshBootstrap>['runtimeAssets']
  scanError: ReturnType<typeof useAgentMeshBootstrap>['scanError']
  scanState: ReturnType<typeof useAgentMeshBootstrap>['scanState']
  selectedHomeAgents: RuntimeKind[]
  selectedOfficeId: string
  setActivePage: (page: PageId) => void
  setLocale: ReturnType<typeof useI18n>['setLocale']
  setOfficeDraft: Dispatch<SetStateAction<OfficeDraft>>
  setSelectedHomeAgents: Dispatch<SetStateAction<RuntimeKind[]>>
  setSelectedOfficeId: Dispatch<SetStateAction<string>>
  setTheme: Dispatch<SetStateAction<ThemeMode>>
  t: ReturnType<typeof useI18n>['t']
  theme: ThemeMode
}) {
  if (activePage === 'dashboard') {
    return (
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
    )
  }

  if (activePage === 'settings') {
    return (
      <SettingsPage
        locale={locale}
        selectedHomeAgents={selectedHomeAgents}
        setLocale={setLocale}
        setSelectedHomeAgents={setSelectedHomeAgents}
        setTheme={setTheme}
        t={t}
        theme={theme}
      />
    )
  }

  if (activePage === 'agents') {
    return (
      <AgentsPage
        adapterStatuses={adapterStatuses}
        config={config}
        personas={personas}
        runtimeAssets={runtimeAssets}
        scanError={scanError}
        scanState={scanState}
        onConfigSaved={refreshConfig}
        onRescan={rescanRuntimes}
        t={t}
      />
    )
  }

  if (activePage === 'tasks') {
    return <TasksPage config={config} offices={offices} t={t} />
  }

  if (activePage === 'chat') {
    return <ChatPage config={config} offices={offices} />
  }

  if (activePage === 'office-create') {
    return (
      <OfficeCreatePage
        officeDraft={officeDraft}
        personas={personas}
        runtimeAssets={runtimeAssets}
        setActivePage={setActivePage}
        setOfficeDraft={setOfficeDraft}
        onSaved={refreshConfig}
        t={t}
      />
    )
  }

  if (activePage === 'office-detail') {
    return (
      <OfficeDetailPage
        config={config}
        office={offices.find((office) => office.id === selectedOfficeId) ?? offices[0]}
        onBack={() => setActivePage('offices')}
        onConfigSaved={refreshConfig}
        t={t}
      />
    )
  }

  return (
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
  )
}

export default App
