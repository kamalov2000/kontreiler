'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order, User } from '@/types/database'
import { formatDate, formatDateTime, formatPrice } from '@/lib/utils'
import { RevealPhone } from '@/components/ui/RevealPhone'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { cn } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'

interface Message {
  id: string
  order_id: string
  carrier_id: string | null
  sender_id: string
  text: string
  created_at: string
  sender?: User
}

function ChatContent() {
  const { id: orderId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user, loading: userLoading } = useUser()
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [otherParty, setOtherParty] = useState<User | null>(null)
  const [carrierId, setCarrierId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [orderCardOpen, setOrderCardOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Задача 11: уведомление о новом сообщении в чате НЕ гасится при открытии чата.
  // Оно остаётся до тех пор, пока пользователь не откроет колокольчик и не нажмёт
  // на это уведомление (обрабатывается в NotificationBell). Поэтому здесь мы
  // намеренно не помечаем new_message уведомления прочитанными.

  useEffect(() => {
    if (userLoading || !user) return
    const currentUser = user

    async function init() {
      const supabase = createClient()

      const { data: orderData } = await supabase
        .from('orders')
        .select('*, client:users!client_id(*)')
        .eq('id', orderId)
        .single()

      if (!orderData) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      const isClient = orderData.client_id === currentUser.id

      let resolvedCarrierId: string | null = null

      if (isClient) {
        // Клиент: carrier берём из ?carrier= (только если этот перевозчик реально
        // откликнулся на заявку) либо из первого отклика
        const paramCarrier = searchParams.get('carrier')
        if (paramCarrier) {
          const { data: respCheck } = await supabase
            .from('responses')
            .select('carrier_id')
            .eq('order_id', orderId)
            .eq('carrier_id', paramCarrier)
            .maybeSingle()
          if (respCheck) resolvedCarrierId = respCheck.carrier_id
        }
        if (!resolvedCarrierId) {
          // Fallback: первый откликнувшийся
          const { data: firstResp } = await supabase
            .from('responses')
            .select('carrier_id, carrier:users!carrier_id(*)')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (firstResp) {
            resolvedCarrierId = firstResp.carrier_id
          }
        }

        if (!resolvedCarrierId) {
          setAccessDenied(true)
          setLoading(false)
          return
        }

        // Загружаем профиль перевозчика
        const { data: carrierData } = await supabase
          .from('users')
          .select('*')
          .eq('id', resolvedCarrierId)
          .single()
        if (carrierData) setOtherParty(carrierData as User)

      } else {
        // Перевозчик: проверяем что откликался
        const { data: resp } = await supabase
          .from('responses')
          .select('carrier_id')
          .eq('order_id', orderId)
          .eq('carrier_id', currentUser.id)
          .single()

        if (!resp) {
          setAccessDenied(true)
          setLoading(false)
          return
        }

        resolvedCarrierId = currentUser.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setOtherParty((orderData as any).client as User)
      }

      setCarrierId(resolvedCarrierId)
      setOrder(orderData as Order)

      // Загружаем сообщения этого диалога
      const { data: msgs } = await supabase
        .from('messages')
        .select('*, sender:users!sender_id(id, name, role)')
        .eq('order_id', orderId)
        .eq('carrier_id', resolvedCarrierId)
        .order('created_at', { ascending: true })

      setMessages((msgs || []) as Message[])
      setLoading(false)
      setTimeout(() => scrollToBottom(), 50)
    }

    init()
  }, [user, userLoading, orderId, searchParams, scrollToBottom])

  // Realtime подписка
  useEffect(() => {
    if (!user || !carrierId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`chat-${orderId}-${carrierId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${orderId}`,
        },
        async (payload) => {
          // Только сообщения этого диалога
          if (payload.new.carrier_id !== carrierId) return

          const { data: senderData } = await supabase
            .from('users')
            .select('id, name, role')
            .eq('id', payload.new.sender_id)
            .single()

          const newMsg: Message = {
            ...(payload.new as Message),
            sender: senderData as User,
          }

          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          setTimeout(() => scrollToBottom(true), 50)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, orderId, carrierId, scrollToBottom])

  async function sendMessage() {
    if (!text.trim() || !user || sending || !carrierId) return
    setSending(true)

    const supabase = createClient()
    const msgText = text.trim()
    setText('')

    const { error } = await supabase.from('messages').insert({
      order_id: orderId,
      sender_id: user.id,
      carrier_id: carrierId,
      text: msgText,
    })

    if (error) {
      setText(msgText)
    } else if (otherParty) {
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          orderId,
          senderId: user.id,
          recipientId: otherParty.id,
        }),
      }).catch(() => {})
    }
    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (loading || userLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (accessDenied) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="flex justify-center mb-4 text-ink-4">
            <Lock size={28} strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-semibold text-ink mb-2">Нет доступа к чату</h2>
          <p className="text-ink-3 text-sm mb-6">
            Чат доступен только участникам сделки: клиенту заявки и откликнувшемуся перевозчику.
          </p>
          <Button variant="secondary" size="sm" onClick={() => router.back()}>
            Назад
          </Button>
        </div>
      </AppLayout>
    )
  }

  const containerLabel = order ? CONTAINER_TYPES.find(c => c.value === order.container_type)?.label : null

  return (
    <AppLayout>
      <div className="max-w-2xl flex flex-col" style={{ height: 'calc(100dvh - 120px)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm text-ink-3 hover:text-ink hover:bg-surface-sunken transition-colors ease-terminal font-medium shrink-0"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {order && (
                <RouteInline from={order.from_city} to={order.to_city} className="flex-none" />
              )}
              {order?.order_number && (
                <span className="font-mono text-[11px] text-ink-3 bg-surface-sunken border border-hairline px-1.5 py-0.5 rounded-field whitespace-nowrap">
                  {order.order_number}
                </span>
              )}
            </div>
            {otherParty && (
              <div className="text-xs text-ink-3 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>Чат с {otherParty.name}</span>
                <RevealPhone kind="order" id={orderId} targetUserId={otherParty.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field text-xs font-medium" />
              </div>
            )}
          </div>
          <button
            onClick={() => setOrderCardOpen(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-card text-xs text-accent bg-accent-soft hover:bg-accent hover:text-white transition-colors ease-terminal font-medium shrink-0"
          >
            Заявка
            {orderCardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Карточка заявки (раскрывается) */}
        {orderCardOpen && order && (
          <div className="mb-3 shrink-0 bg-surface border border-hairline rounded-card p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <StatusPill status={order.status} kind="order" />
              {order.is_urgent && (
                <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-danger">
                  Срочно
                </span>
              )}
              <Link
                href={`/orders/${orderId}`}
                className="text-xs text-accent hover:text-accent-hover ml-auto"
              >
                Открыть полностью →
              </Link>
            </div>
            <div className="mb-3">
              <RouteInline from={order.from_city} to={order.to_city} via={order.via_city} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-sunken rounded-field p-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 mb-1">Контейнер</div>
                <div>{containerLabel ? <ContainerChip label={containerLabel} /> : <span className="text-sm text-ink-2">—</span>}</div>
              </div>
              <div className="bg-surface-sunken rounded-field p-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 mb-1">Ставка</div>
                <div className="font-mono text-sm font-medium tabular-nums text-ink">{formatPrice(order.price, order.is_negotiable)}</div>
              </div>
              <div className="bg-surface-sunken rounded-field p-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 mb-1">Дата</div>
                <div className="font-mono text-sm tabular-nums text-ink-2">{formatDate(order.ready_date)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Chat container */}
        <div className="flex-1 flex flex-col min-h-0 bg-paper border border-hairline rounded-card overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-ink-3 text-sm">
                <ContainerMark size={28} className="text-ink-4" />
                <p>Начните диалог — напишите первое сообщение</p>
              </div>
            ) : (
              messages.map(msg => {
                const isOwn = msg.sender_id === user?.id
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col max-w-[78%]',
                      isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
                    )}
                  >
                    {!isOwn && (
                      <span className="text-xs text-ink-3 mb-1 px-1">
                        {msg.sender?.name || 'Пользователь'}
                      </span>
                    )}
                    <div
                      className={cn(
                        'px-3.5 py-2.5 rounded-card text-sm leading-relaxed break-words',
                        isOwn
                          ? 'bg-accent text-white rounded-tr-sm'
                          : 'bg-surface border border-hairline text-ink rounded-tl-sm'
                      )}
                    >
                      {msg.text}
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-ink-4 mt-1 px-1">
                      {formatDateTime(msg.created_at)}
                    </span>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-hairline bg-surface shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Написать сообщение... (Enter — отправить)"
                rows={1}
                maxLength={2000}
                className="flex-1 resize-none px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none min-h-[44px] max-h-[120px] bg-surface-sunken rounded-card border border-hairline focus:border-accent focus:ring-2 focus:ring-accent focus:bg-surface transition-colors ease-terminal"
                style={{ overflowY: text.includes('\n') ? 'auto' : 'hidden' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!text.trim() || sending}
                className="flex items-center justify-center h-11 w-11 rounded-card bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40 disabled:cursor-not-allowed transition-colors ease-terminal shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="font-mono text-[11px] text-ink-4 mt-1.5 text-right">
              Enter — отправить, Shift+Enter — перенос строки
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  )
}
