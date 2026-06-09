import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

export type Locale = 'zh' | 'en' | 'ja'

const dictionaries = { zh, en, ja } as const
const storageKey = 'agent-mesh.language'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readInitialLocale())

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale(nextLocale) {
      localStorage.setItem(storageKey, nextLocale)
      setLocaleState(nextLocale)
    },
    t(key) {
      return resolveMessage(dictionaries[locale], key) ?? resolveMessage(dictionaries.zh, key) ?? key
    },
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider')
  }
  return context
}

function readInitialLocale(): Locale {
  const saved = localStorage.getItem(storageKey)
  if (saved === 'zh' || saved === 'en' || saved === 'ja') return saved

  // Agent Mesh 默认中文；只有系统明确是日文或英文时才自动切换。
  const language = navigator.language.toLowerCase()
  if (language.startsWith('ja')) return 'ja'
  if (language.startsWith('en')) return 'en'
  return 'zh'
}

function resolveMessage(source: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, source)

  return typeof value === 'string' ? value : undefined
}
