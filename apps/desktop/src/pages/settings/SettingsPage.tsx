import { type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { AgentLogo, runtimeCatalog } from '../../components/common'
import type { Locale } from '../../i18n'
import type { RuntimeKind } from '../../types/agentMesh'

type ThemeMode = 'light' | 'dark' | 'system'
type Translator = (key: string) => string

const defaultHomeAgents: RuntimeKind[] = ['hermes', 'openclaw', 'claude-code', 'codex']

export function SettingsPage({
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
      <header className="pageHeader">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.description')}</p>
        </div>
      </header>

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
        <div className="themePreview">
          <span />
          <div>
            <strong>实时主题预览</strong>
            <small>背景、卡片、边框和文字会随主题立即切换。</small>
          </div>
        </div>
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
