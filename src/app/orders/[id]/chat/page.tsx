'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order, User } from '@/types/database'
import { formatDate, formatDateTime, formatPrice, maskPhone, formatPhone } from '@/lib/utils'
import { AppLayout } from '@/components/layout/AppLayout'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_LABEL, ORDER_STATUS_CLASS } from '@/lib/status'
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
  const [phoneRevealed, setPhoneRevealed] = useState(false)
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
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (accessDenied) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Нет доступа к чату</h2>
          <p className="text-gray-500 text-sm mb-6">
            Чат доступен только участникам сделки: клиенту заявки и откликнувшемуся перевозчику.
          </p>
          <button onClick={() => router.back()} className="text-blue-600 hover:underline text-sm">
            ← Назад
          </button>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors font-medium"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 flex-wrap">
              {order?.from_city}
              <ArrowRight size={12} className="text-gray-400 shrink-0" />
              {order?.to_city}
              {order?.order_number && (
                <span className="text-xs font-mono font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  {order.order_number}
                </span>
              )}
            </div>
            {otherParty && (
              <div className="text-xs text-gray-500">
                Чат с {otherParty.name}
                {/* Скрываем телефон клиента перевозчику если hide_phone=true */}
                {otherParty.phone && !(order?.hide_phone && order?.client_id !== user?.id) && (
                  phoneRevealed ? (
                    <a href={`tel:${otherParty.phone}`} className="ml-2 text-blue-600 hover:underline">
                      {formatPhone(otherParty.phone)}
                    </a>
                  ) : (
                    <button
                      onClick={() => setPhoneRevealed(true)}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      {maskPhone(otherParty.phone)}
                    </button>
                  )
                )}
                {order?.hide_phone && order?.client_id !== user?.id && (
                  <span className="ml-2 text-gray-400 italic">телефон скрыт клиентом</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setOrderCardOpen(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors font-medium shrink-0"
          >
            Заявка
            {orderCardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Карточка заявки (раскрывается) */}
        {orderCardOpen && order && (
          <div className="mb-3 shrink-0 bg-white border border-blue-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_CLASS[order.status]}`}>
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </span>
              {order.is_urgent && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                  🔴 СРОЧНО
                </span>
              )}
              <Link
                href={`/orders/${orderId}`}
                className="text-xs text-blue-600 hover:underline ml-auto"
              >
                Открыть полностью →
              </Link>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg font-bold text-gray-900">{order.from_city}</span>
              <ArrowRight size={16} className="text-gray-400 shrink-0" />
              <span className="text-lg font-bold text-gray-900">{order.to_city}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-50 rounded-xl p-2">
                <div className="text-gray-400 mb-0.5">Контейнер</div>
                <div className="font-medium text-gray-800">{containerLabel}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2">
                <div className="text-gray-400 mb-0.5">Ставка</div>
                <div className="font-medium text-blue-700">{formatPrice(order.price, order.is_negotiable)}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2">
                <div className="text-gray-400 mb-0.5">Дата</div>
                <div className="font-medium text-gray-800">{formatDate(order.ready_date)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Chat container */}
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                <div className="text-3xl mb-3">💬</div>
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
                      <span className="text-xs text-gray-500 mb-1 px-1">
                        {msg.sender?.name || 'Пользователь'}
                      </span>
                    )}
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
                        isOwn
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm shadow-sm'
                      )}
                    >
                      {msg.text}
                    </div>
                    <span className="text-xs text-gray-400 mt-1 px-1">
                      {formatDateTime(msg.created_at)}
                    </span>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 bg-white shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Написать сообщение... (Enter — отправить)"
                rows={1}
                maxLength={2000}
                className="flex-1 resize-none px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none min-h-[36px] max-h-[120px] bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-300 focus:bg-white transition-colors"
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
                className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1 text-right">
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
