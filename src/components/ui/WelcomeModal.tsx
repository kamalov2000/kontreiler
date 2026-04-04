'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ArrowRight } from 'lucide-react'
import { useUser } from '@/hooks/useUser'

const STORAGE_KEY = 'welcome_shown_v1'

export function WelcomeModal() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading || !user) return
    const shown = localStorage.getItem(STORAGE_KEY)
    if (!shown) setVisible(true)
  }, [user, loading])

  function handleStart() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    if (user?.role === 'carrier') {
      router.push('/profile')
    } else {
      router.push('/orders/new')
    }
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible || !user) return null

  const isCarrier = user.role === 'carrier'

  const steps = isCarrier
    ? [
        { icon: '👤', text: 'Заполните профиль — укажите телефон, город и компанию' },
        { icon: '📋', text: 'Смотрите ленту заявок — обновляется в реальном времени' },
        { icon: '✅', text: 'Откликайтесь на подходящие — клиент увидит вас сразу' },
      ]
    : [
        { icon: '📦', text: 'Разместите заявку — укажите маршрут, тип контейнера и дату' },
        { icon: '🔔', text: 'Перевозчики увидят её и начнут откликаться' },
        { icon: '🤝', text: 'Выберите лучшего — обсудите детали в чате' },
      ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-xl mb-1">
          <Package size={24} />
          Контрейл
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isCarrier ? 'Добро пожаловать, перевозчик!' : 'Добро пожаловать!'}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isCarrier
            ? 'Вот как найти загрузку за 3 шага:'
            : 'Вот как отправить груз за 3 шага:'}
        </p>

        <div className="space-y-3 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-base shrink-0">
                {s.icon}
              </div>
              <p className="text-sm text-gray-700 pt-1">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {isCarrier ? 'Заполнить профиль' : 'Разместить заявку'}
            <ArrowRight size={16} />
          </button>
          <button
            onClick={handleSkip}
            className="px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  )
}
