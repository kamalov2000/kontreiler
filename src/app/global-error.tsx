'use client'

import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 text-center">
          <span className="flex items-center justify-center w-[52px] h-[52px] rounded-full bg-danger-soft mb-4">
            <AlertTriangle size={26} strokeWidth={1.5} className="text-danger" />
          </span>
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-lg font-semibold text-ink">Что-то пошло не так</span>
            <span className="font-mono text-xs text-ink-4">error · попробуйте обновить</span>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-field bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Попробовать снова
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-field bg-surface border border-hairline text-ink text-sm font-medium hover:bg-surface-sunken transition-colors"
            >
              На главную
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
