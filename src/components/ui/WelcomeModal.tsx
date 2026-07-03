'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, FileText, ArrowRight } from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { createClient } from '@/lib/supabase/client'

export function WelcomeModal() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading || !user) return
    if (!user.onboarding_completed) setVisible(true)
  }, [user, loading])

  async function markDone() {
    if (!user) return
    const supabase = createClient()
    await supabase.from('users').update({ onboarding_completed: true }).eq('id', user.id)
  }

  async function handleStart() {
    await markDone()
    setVisible(false)
    if (user?.role === 'carrier') {
      router.push('/feed')
    } else {
      router.push('/orders/new')
    }
  }

  async function handleSkip() {
    await markDone()
    setVisible(false)
  }

  if (!visible || !user) return null

  const isCarrier = user.role === 'carrier'

  // Три шага онбординга. Иконка-плитка вместо эмодзи — по тону акцента.
  const steps = isCarrier
    ? [
        {
          Icon: User,
          title: 'Заполните профиль компании',
          desc: 'Телефон, город, компания и верификация email — открывает отклики.',
        },
        {
          Icon: FileText,
          title: 'Смотрите ленту заявок',
          desc: 'Обновляется в реальном времени — маршрут, тип контейнера, ставка.',
        },
        {
          Icon: ArrowRight,
          title: 'Договоритесь напрямую',
          desc: 'Контакты открываются после отклика — звоните и везите.',
        },
      ]
    : [
        {
          Icon: User,
          title: 'Заполните профиль компании',
          desc: 'ИНН, контакты, верификация email — открывает размещение заявок.',
        },
        {
          Icon: FileText,
          title: 'Разместите заявку',
          desc: 'Маршрут, тип контейнера, дата — 30 секунд.',
        },
        {
          Icon: ArrowRight,
          title: 'Договоритесь напрямую',
          desc: 'Контакты открываются после отклика — звоните и везите.',
        },
      ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-modal shadow-overlay border border-hairline w-full max-w-md overflow-hidden">
        {/* Шапка: глиф контейнера + бренд, заголовок, подзаголовок */}
        <div className="px-7 pt-7 flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true">
              <rect x="1.5" y="4.5" width="17" height="11" rx="2" fill="none" stroke="#0E6E6E" strokeWidth="1.5" />
              <line x1="7" y1="4.5" x2="7" y2="15.5" stroke="#0E6E6E" strokeWidth="1.5" />
              <line x1="13" y1="4.5" x2="13" y2="15.5" stroke="#0E6E6E" strokeWidth="1.5" />
            </svg>
            <span className="text-xl font-bold tracking-tight text-ink">Контрейл</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink">
            {isCarrier ? 'Добро пожаловать на биржу фрахта' : 'Добро пожаловать на биржу фрахта'}
          </h2>
          <p className="text-sm leading-relaxed text-ink-3">
            {isCarrier
              ? 'Три шага — и вы на ленте заявок.'
              : 'Три шага — и ваша первая заявка на доске.'}
          </p>
        </div>

        {/* Три шага — строки с волосяным разделителем */}
        <div className="px-7 py-5 flex flex-col">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`flex gap-3.5 py-3 ${i < steps.length - 1 ? 'border-b border-hairline' : ''}`}
            >
              <span className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                <s.Icon size={18} strokeWidth={1.5} className="text-accent" />
              </span>
              <div>
                <div className="text-[15px] font-semibold text-ink">{s.title}</div>
                <div className="text-[13px] text-ink-3 mt-0.5 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Футер: hairline + bg-paper */}
        <div className="flex justify-end gap-2.5 px-7 py-3.5 border-t border-hairline bg-paper">
          <button
            onClick={handleSkip}
            className="min-h-[40px] px-4 rounded-card border border-hairline bg-surface text-sm text-ink hover:bg-surface-sunken transition-colors"
          >
            Позже
          </button>
          <button
            onClick={handleStart}
            className="min-h-[40px] px-4 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Начать
          </button>
        </div>
      </div>
    </div>
  )
}
