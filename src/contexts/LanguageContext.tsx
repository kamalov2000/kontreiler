'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { Locale, translations } from '@/lib/translations'

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: typeof translations['ru']
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'ru',
  setLocale: () => {},
  t: translations['ru'],
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ru')

  useEffect(() => {
    const saved = localStorage.getItem('kontreyl_locale') as Locale | null
    if (saved && ['ru', 'en', 'zh'].includes(saved)) {
      setLocaleState(saved)
    }
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('kontreyl_locale', l)
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
