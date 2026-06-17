import { useEffect, useState } from 'react'
import { agentMeshApi } from '../services/agentMeshApi'
import type {
  AgentMeshConfig,
  Office,
  Persona,
  RuntimeAdapterStatus,
  RuntimeAsset,
} from '../types/agentMesh'

const defaultConfig: AgentMeshConfig = {
  schemaVersion: '0.1',
  stateDir: '.agent-mesh',
  runtimes: {},
  personas: {},
  offices: {},
  officeMembers: {},
}

export type RuntimeScanState = 'idle' | 'scanning' | 'failed'
export type BootstrapState = 'loading' | 'ready' | 'error'

// 负责桌面端启动时的配置加载与 Runtime 扫描，页面只消费结果和刷新动作。
export function useAgentMeshBootstrap() {
  const [config, setConfig] = useState<AgentMeshConfig>(defaultConfig)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [runtimeAssets, setRuntimeAssets] = useState<RuntimeAsset[]>([])
  const [adapterStatuses, setAdapterStatuses] = useState<RuntimeAdapterStatus[]>([])
  const [scanState, setScanState] = useState<RuntimeScanState>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>('loading')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  async function refreshConfig() {
    const [nextConfig, nextPersonas, nextOffices, nextAdapterStatuses] = await Promise.all([
      agentMeshApi.loadConfig(),
      agentMeshApi.listPersonas(),
      agentMeshApi.listOffices(),
      agentMeshApi.listRuntimeAdapters(),
    ])
    setConfig(nextConfig)
    setPersonas(nextPersonas)
    setOffices(nextOffices)
    setAdapterStatuses(nextAdapterStatuses)
  }

  async function rescanRuntimes() {
    setScanState('scanning')
    setScanError(null)
    try {
      const result = await agentMeshApi.detectRuntimes()
      setRuntimeAssets(result.runtimes)
      setScanState('idle')
    } catch (error) {
      setScanState('failed')
      setScanError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setBootstrapState('loading')
      setBootstrapError(null)

      const [configResult] = await Promise.allSettled([
        refreshConfig(),
        rescanRuntimes(),
      ])

      if (cancelled) return

      if (configResult.status === 'rejected') {
        setBootstrapError(configResult.reason instanceof Error ? configResult.reason.message : String(configResult.reason))
        setBootstrapState('error')
        return
      }

      setBootstrapState('ready')
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  return {
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
  }
}
