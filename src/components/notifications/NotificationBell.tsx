'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  X,
  MessageSquare,
  Truck,
  Check,
  CheckCheck,
  Ban,
  Pencil,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Notification } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type NotifTone = 'accent' | 'warning' | 'success' | 'danger' | 'neutral'

// Метаданные типа уведомления: подпись, иконка-плитка и тон тонировки.
const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: NotifTone }> = {
  new_response:       { label: 'Новый отклик на заявку', icon: Bell,          tone: 'accent'  },
  new_message:        { label: 'Новое сообщение в чате',  icon: MessageSquare, tone: 'accent'  },
  new_truck_response: { label: 'Отклик на ваш рейс',      icon: Truck,         tone: 'warning' },
  new_truck_message:  { label: 'Сообщение по рейсу',      icon: MessageSquare, tone: 'accent'  },
  response_accepted:  { label: 'Ваш отклик принят',       icon: Check,         tone: 'success' },
  order_delivered:    { label: 'Груз доставлен',          icon: CheckCheck,    tone: 'success' },
  trip_done:          { label: 'Рейс выполнен',           icon: CheckCheck,    tone: 'success' },
  order_cancelled:    { label: 'Заявка отменена',         icon: Ban,           tone: 'danger'  },
  order_changed:      { label: 'Заявка изменена клиентом', icon: Pencil,       tone: 'warning' },
  review_request:     { label: 'Оставьте отзыв',          icon: Star,          tone: 'warning' },
  auction_won:        { label: 'Вы победили в торгах',     icon: Trophy,        tone: 'success' },
  auction_ended:      { label: 'Торги завершены',         icon: Bell,          tone: 'neutral' },
}

const FALLBACK_META = { label: 'Уведомление', icon: Bell, tone: 'neutral' as NotifTone }

// Тонировка квадратной иконки-плитки по тону типа.
const TONE_TILE: Record<NotifTone, string> = {
  accent:  'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  danger:  'bg-danger-soft text-danger',
  neutral: 'bg-surface-sunken text-ink-3',
}

function metaFor(type: string) {
  return TYPE_META[type] ?? FALLBACK_META
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
            const label = metaFor(notif.type).label
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
          'relative flex items-center justify-center w-9 h-9 rounded-lg border border-hairline transition-colors',
          open ? 'bg-accent-soft' : 'bg-surface hover:bg-paper'
        )}
        aria-label="Уведомления"
      >
        <Bell size={18} className="text-accent" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white font-mono tabular-nums text-[10px] font-medium flex items-center justify-center leading-none ring-[1.5px] ring-paper">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-surface border border-hairline rounded-card shadow-overlay overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-hairline">
            <span className="text-[15px] font-semibold text-ink">Уведомления</span>
            {unreadCount > 0 && (
              <span className="font-mono tabular-nums text-xs text-accent">{unreadCount}</span>
            )}
            <span className="flex-1" />
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-accent hover:underline"
              >
                Прочитать все
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-field text-ink-3 hover:bg-surface-sunken transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 text-center px-9 py-10">
                <Bell size={26} className="text-ink-4" />
                <span className="text-sm text-ink-3">
                  Уведомлений нет. Отклики и статусы рейсов появятся здесь.
                </span>
              </div>
            ) : (
              <>
                {/* Непрочитанные */}
                {unreadNotifs.length > 0 && (
                  <div>
                    <div className="px-4 pt-2.5 pb-1 bg-paper text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
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
                      <div className="px-4 pt-2.5 pb-1 bg-paper text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
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
  const meta = metaFor(n.type)
  const Icon = meta.icon
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex gap-2.5 px-4 py-3 bg-surface hover:bg-paper transition-colors border-b border-hairline last:border-0"
    >
      <span
        className={cn(
          'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
          !n.is_read && 'bg-accent'
        )}
      />
      <span
        className={cn(
          'w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0',
          TONE_TILE[meta.tone]
        )}
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[13px] leading-snug', n.is_read ? 'text-ink-2' : 'text-ink')}>
          <span className="font-semibold text-ink">{meta.label}</span>
        </div>
        {n.message && (
          <div className="text-xs text-ink-3 mt-0.5 whitespace-pre-line">
            {n.message}
          </div>
        )}
        <div className="font-mono tabular-nums text-[11px] text-ink-4 mt-0.5">
          {formatNotifDate(n.created_at)}
        </div>
      </div>
    </button>
  )
}
