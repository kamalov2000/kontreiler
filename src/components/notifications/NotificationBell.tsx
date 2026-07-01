'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Notification } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TYPE_LABEL: Record<string, string> = {
  new_response:       '🔔 Новый отклик на заявку',
  new_message:        '💬 Новое сообщение в чате',
  new_truck_response: '🚛 Отклик на ваш рейс',
  new_truck_message:  '💬 Сообщение по рейсу',
  response_accepted:  '✅ Ваш отклик принят!',
  order_delivered:    '✅ Груз доставлен!',
  trip_done:          '✅ Рейс выполнен',
  order_cancelled:    '⚠️ Заявка отменена',
  order_changed:      '✏️ Заявка изменена клиентом',
  review_request:     '⭐ Оставьте отзыв',
  auction_won:        '🏆 Вы победили в торгах!',
  auction_ended:      '🔔 Торги завершены',
}

function formatNotifDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  if (diffHours < 24) return `${diffHours} ч назад`
  if (diffDays === 1) return `вчера в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function NotificationBell() {
  const { user } = useUser()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isFirstLoad = useRef(true)

  // Загрузка + Realtime подписка
  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setNotifications((data || []) as Notification[])
        isFirstLoad.current = false
      })

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as Notification
          setNotifications(prev => [notif, ...prev].slice(0, 50))

          // Push-toast при новом уведомлении (если панель закрыта)
          if (!isFirstLoad.current) {
            const label = TYPE_LABEL[notif.type] ?? '🔔 Уведомление'
            toast(label, {
              description: notif.message
                ? `${notif.message}\n${formatNotifDate(notif.created_at)}`
                : formatNotifDate(notif.created_at),
              action: {
                label: 'Открыть',
                onClick: () => router.push(notif.link),
              },
              duration: notif.message ? 10000 : 6000,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev =>
            prev.map(n => n.id === (payload.new as Notification).id ? (payload.new as Notification) : n)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, router])

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unreadCount = notifications.filter(n => !n.is_read).length
  const unreadNotifs = notifications.filter(n => !n.is_read)
  const readNotifs = notifications.filter(n => n.is_read)

  async function handleClick(n: Notification) {
    setOpen(false)
    if (!n.is_read) {
      const supabase = createClient()
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    router.push(n.link)
  }

  async function markAllRead() {
    if (!user || unreadCount === 0) return
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
          open ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
        )}
        aria-label="Уведомления"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <span className="font-semibold text-sm text-gray-900">
              Уведомления
              {unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Прочитать все
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                <Bell size={32} className="mb-2 opacity-20" />
                Нет уведомлений
              </div>
            ) : (
              <>
                {/* Непрочитанные */}
                {unreadNotifs.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-blue-50/40 border-b border-blue-50">
                      Новые
                    </div>
                    {unreadNotifs.map(n => (
                      <NotifRow key={n.id} n={n} onClick={() => handleClick(n)} />
                    ))}
                  </div>
                )}
                {/* Прочитанные */}
                {readNotifs.length > 0 && (
                  <div>
                    {unreadNotifs.length > 0 && (
                      <div className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                        Ранее
                      </div>
                    )}
                    {readNotifs.map(n => (
                      <NotifRow key={n.id} n={n} onClick={() => handleClick(n)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifRow({ n, onClick }: { n: Notification; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
        !n.is_read && 'bg-blue-50/50'
      )}
    >
      <div className="flex items-start gap-2.5">
        {!n.is_read && (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        )}
        <div className={cn('flex-1 min-w-0', n.is_read && 'pl-4')}>
          <div className="text-sm font-medium text-gray-900 leading-snug">
            {TYPE_LABEL[n.type] ?? '🔔 Уведомление'}
          </div>
          {n.message && (
            <div className="text-xs text-gray-600 mt-1 whitespace-pre-line bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
              {n.message}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <span>{formatNotifDate(n.created_at)}</span>
            <span className="text-gray-200">·</span>
            <span className="text-[11px] text-gray-300">
              {new Date(n.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
