'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck, TruckMessage, User } from '@/types/database'
import { formatDateTime, maskPhone, formatPhone } from '@/lib/utils'
import { AppLayout } from '@/components/layout/AppLayout'
import { cn } from '@/lib/utils'

function TruckChatContent() {
  const { id: truckId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user, loading: userLoading } = useUser()

  const [truck, setTruck] = useState<Truck | null>(null)
  const [messages, setMessages] = useState<TruckMessage[]>([])
  const [otherParty, setOtherParty] = useState<User | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [chatClientId, setChatClientId] = useState<string | null>(null)
  const [phoneRevealed, setPhoneRevealed] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useEffect(() => {
    if (userLoading || !user) return
    const currentUser = user

    async function init() {
      const supabase = createClient()

      // Грузим данные машины
      const { data: truckData } = await supabase
        .from('trucks')
        .select('*, carrier:users!carrier_id(*)')
        .eq('id', truckId)
        .single()

      if (!truckData) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      const isCarrier = truckData.carrier_id === currentUser.id
      let resolvedClientId: string | null = null

      if (isCarrier) {
        // Перевозчик: берём client из ?client= или из первого отклика
        const paramClient = searchParams.get('client')
        if (paramClient) {
          resolvedClientId = paramClient
        } else {
          // maybeSingle — не бросает 406 если нет откликов
          const { data: firstResp } = await supabase
            .from('truck_responses')
            .select('client_id')
            .eq('truck_id', truckId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (firstResp) resolvedClientId = firstResp.client_id
        }

        if (!resolvedClientId) {
          setAccessDenied(true)
          setLoading(false)
          return
        }

        // Загружаем собеседника (клиента)
        const { data: clientData } = await supabase
          .from('users')
          .select('*')
          .eq('id', resolvedClientId)
          .single()
        if (clientData) setOtherParty(clientData as User)
      } else {
        // Клиент: проверяем что есть отклик
        // maybeSingle — не бросает 406 если нет отклика
        const { data: resp } = await supabase
          .from('truck_responses')
          .select('client_id')
          .eq('truck_id', truckId)
          .eq('client_id', currentUser.id)
          .maybeSingle()

        if (!resp) {
          setAccessDenied(true)
          setLoading(false)
          return
        }

        resolvedClientId = currentUser.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setOtherParty((truckData as any).carrier as User)
      }

      setChatClientId(resolvedClientId)
      setTruck(truckData as Truck)

      // Грузим сообщения без JOIN (два FK на users — лучше отдельно)
      const { data: msgs } = await supabase
        .from('truck_messages')
        .select('*')
        .eq('truck_id', truckId)
        .eq('client_id', resolvedClientId)
        .order('created_at', { ascending: true })

      if (msgs && msgs.length > 0) {
        // Грузим профили отправителей одним запросом
        const senderIds = Array.from(new Set(msgs.map(m => m.sender_id)))
        const { data: senders } = await supabase
          .from('users')
          .select('id, name, role')
          .in('id', senderIds)

        const senderMap: Record<string, User> = {}
        for (const s of senders || []) senderMap[s.id] = s as User

        setMessages(msgs.map(m => ({ ...m, sender: senderMap[m.sender_id] })) as TruckMessage[])
      } else {
        setMessages([])
      }

      setLoading(false)
      setTimeout(() => scrollToBottom(), 50)
    }

    init()
  }, [user, userLoading, truckId, searchParams, scrollToBottom])

  // Realtime подписка — только когда chatClientId известен
  useEffect(() => {
    if (!user || !chatClientId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`truck-chat-${truckId}-${chatClientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'truck_messages',
          filter: `truck_id=eq.${truckId}`,
        },
        async (payload) => {
          // Только сообщения текущего диалога
          if (payload.new.client_id !== chatClientId) return

          // Грузим профиль отправителя отдельно (избегаем проблему двух FK)
          const { data: senderData } = await supabase
            .from('users')
            .select('id, name, role')
            .eq('id', payload.new.sender_id)
            .single()

          const newMsg: TruckMessage = {
            ...(payload.new as TruckMessage),
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
  }, [user, truckId, chatClientId, scrollToBottom])

  async function sendMessage() {
    if (!text.trim() || !user || sending || !chatClientId || !truck) return
    setSending(true)

    const supabase = createClient()
    const msgText = text.trim()
    setText('')

    const { error } = await supabase.from('truck_messages').insert({
      truck_id: truckId,
      client_id: chatClientId,
      carrier_id: truck.carrier_id,
      sender_id: user.id,
      text: msgText,
    })

    if (error) {
      setText(msgText)
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

  const backHref = `/trucks/${truckId}`

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
            Чат доступен перевозчику и клиенту, откликнувшемуся на рейс.
          </p>
          <Link href={backHref} className="text-blue-600 hover:underline text-sm">
            ← Назад
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <Link
            href={backHref}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              {truck?.from_city}
              <ArrowRight size={12} className="text-gray-400 shrink-0" />
              {truck?.to_city}
            </div>
            {otherParty && (
              <div className="text-xs text-gray-500">
                Чат с {otherParty.name}
                {otherParty.phone && (
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
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
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
        <div className="mt-3 shrink-0">
          <div className="flex gap-2 items-end bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Написать сообщение... (Enter — отправить)"
              rows={1}
              maxLength={2000}
              className="flex-1 resize-none px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none min-h-[36px] max-h-[120px]"
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
    </AppLayout>
  )
}

export default function TruckChatPage() {
  return (
    <Suspense>
      <TruckChatContent />
    </Suspense>
  )
}
