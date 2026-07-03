'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import { Locale } from '@/lib/translations'
import { cn } from '@/lib/utils'

const LABELS: Record<Locale, string> = { ru: 'RU', en: 'EN', zh: '中文' }

// Иконка глобуса слева (stroke #64748B) и шеврон справа — как фон нативного select
const GLOBE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='1.5'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18'/%3E%3C/svg%3E\")"
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")"

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage()
  return (
    <select
      value={locale}
      onChange={e => setLocale(e.target.value as Locale)}
      style={{
        backgroundImage: `${GLOBE}, ${CHEVRON}`,
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundPosition: 'left 10px center, right 10px center',
      }}
      className={cn(
        'h-9 cursor-pointer appearance-none rounded-field border border-hairline bg-surface',
        'pl-8 pr-8 font-mono text-[13px] tabular-nums text-ink transition-colors',
        'hover:border-border-strong',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
        className
      )}
    >
      {(Object.keys(LABELS) as Locale[]).map(l => (
        <option key={l} value={l}>{LABELS[l]}</option>
      ))}
    </select>
  )
}
