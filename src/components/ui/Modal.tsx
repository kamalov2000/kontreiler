'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/[.32]"
        onClick={onClose}
      />
      <div className={cn(
        'relative flex w-full flex-col overflow-hidden bg-surface shadow-overlay',
        'rounded-t-modal border-x border-t border-hairline',
        'sm:max-w-md sm:rounded-modal sm:border',
        'max-h-[90vh]',
        className
      )}>
        {/* Грабер — только на мобильном листе снизу */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-field text-ink-3 transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 text-sm leading-relaxed text-ink-2">
          {children}
        </div>
      </div>
    </div>
  )
}
