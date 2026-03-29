'use client'

import { Toaster } from 'sonner'
import { LanguageProvider } from '@/contexts/LanguageContext'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <Toaster position="top-right" richColors />
    </LanguageProvider>
  )
}
