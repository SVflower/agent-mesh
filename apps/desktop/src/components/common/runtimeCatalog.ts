import hermesLogo from '../../assets/logos/hermes.png'
import openclawLogo from '../../assets/logos/openclaw.png'
import type { RuntimeKind } from '../../types/agentMesh'

export const runtimeCatalog: Record<RuntimeKind, {
  command: string
  fallback: string
  logoUrl: string
  name: string
  officialSite: string
}> = {
  hermes: {
    name: 'Hermes',
    fallback: 'HM',
    logoUrl: hermesLogo,
    officialSite: 'https://hermes-agent.nousresearch.com/docs/',
    command: 'hermes',
  },
  openclaw: {
    name: 'OpenClaw',
    fallback: 'OC',
    logoUrl: openclawLogo,
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
