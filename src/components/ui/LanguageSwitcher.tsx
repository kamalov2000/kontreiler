'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import { Locale } from '@/lib/translations'
import { cn } from '@/lib/utils'

const LABELS: Record<Locale, string> = { ru: 'RU', en: 'EN', zh: '中文' }

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage()
  return (
    <select
      value={locale}
      onChange={e => setLocale(e.target.value as Locale)}
      className={cn(
        'text-sm text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
        className
      )}
    >
      {(Object.keys(LABELS) as Locale[]).map(l => (
        <option key={l} value={l}>{LABELS[l]}</option>
      ))}
    </select>
  )
}
