import type { ReactNode } from 'react'

export function LogPreview({ children, compact = false, tall = false }: { children: ReactNode; compact?: boolean; tall?: boolean }) {
  const className = ['logPreview', compact ? 'compactLog' : '', tall ? 'tall' : ''].filter(Boolean).join(' ')
  return <div className={className}>{children}</div>
}
