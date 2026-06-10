import type { RuntimeKind } from '../../types/agentMesh'
import { runtimeCatalog } from './runtimeCatalog'

export function AgentLogo({ compact = false, kind }: { compact?: boolean; kind: RuntimeKind }) {
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
