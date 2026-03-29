'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import { Locale } from '@/lib/translations'
import { cn } from '@/lib/utils'

const LABELS: Record<Locale, string> = { ru: 'RU', en: 'EN', zh: '中' }

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage()
  return (
    <div className={cn('flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5', className)}>
      {(['ru', 'en', 'zh'] as Locale[]).map(l => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            'px-2 py-1 rounded-md text-xs font-medium transition-colors',
            locale === l
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  )
}
