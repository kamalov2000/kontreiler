'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, MapPin, User, CheckCircle, Route, Zap } from 'lucide-react'
import { RevealPhone } from '@/components/ui/RevealPhone'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck, TruckResponse } from '@/types/database'
import { formatDate, formatDateTime, formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { TRUCK_STATUS_LABEL } from '@/lib/status'
import { toast } from 'sonner'

export default function TruckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: userLoading } = useUser()

  const [truck, setTruck] = useState<Truck | null>(null)
  const [responses, setResponses] = useState<TruckResponse[]>([])
  const [hasResponded, setHasResponded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)

  const isCarrier = user?.role === 'carrier'
  const isClient = user?.role === 'client'
  const [acceptingClientId, setAcceptingClientId] = useState<string | null>(null)

  useEffect(() => {
    if (userLoading || !user) return

    async function fetch() {
      const supabase = createClient()

      const { data: truckData } = await supabase
        .from('trucks')
        .select('*, carrier:users!carrier_id(*)')
        .eq('id', id)
        .single()

      if (!truckData) {
        router.push(isCarrier ? '/my-trucks' : '/trucks')
        return
      }

      setTruck(truckData as Truck)

      // Перевозчик видит свои отклики, клиент — свой отклик
      if (isCarrier && truckData.carrier_id === user.id) {
        const { data: resp } = await supabase
          .from('truck_responses')
          .select('*, client:users!client_id(*)')
          .eq('truck_id', id)
          .order('created_at', { ascending: false })
        setResponses((resp || []) as TruckResponse[])
      } else if (isClient) {
        const { data: myResp } = await supabase
          .from('truck_responses')
          .select('*')
          .eq('truck_id', id)
          .eq('client_id', user.id)
          .single()
        if (myResp) setHasResponded(true)
      }

      setLoading(false)
    }

    fetch()
  }, [user, userLoading, id, router, isCarrier, isClient])

  async function handleRespond() {
    if (!user) return
    setResponding(true)

    const supabase = createClient()
    const { error } = await supabase.from('truck_responses').insert({
      truck_id: id,
      client_id: user.id,
      message: message.trim() || null,
    })

    if (error) {
      toast.error('Ошибка при отклике')
      setResponding(false)
      return
    }

    toast.success('Отклик отправлен! Переходим в чат...')
    setHasResponded(true)
    setResponding(false)
    router.push(`/trucks/${id}/chat`)
  }

  async function acceptClient(clientId: string) {
    if (!truck) return
    setAcceptingClientId(clientId)
    const supabase = createClient()
    const { error } = await supabase
      .from('trucks')
      .update({ status: 'busy' })
      .eq('id', truck.id)
    if (error) {
      toast.error('Ошибка при принятии клиента')
    } else {
      toast.success('Клиент принят, машина занята')
      setTruck(prev => prev ? { ...prev, status: 'busy' } : prev)
    }
    setAcceptingClientId(null)
  }

  if (loading || userLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl">
          <div className="h-4 w-28 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer mb-6" />
          <div className="bg-surface rounded-card border border-hairline p-6 mb-6 space-y-5">
            <div className="h-5 w-24 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
            <div className="h-8 w-3/4 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!truck) return null

  const containerLabel = TRUCK_CONTAINER_TYPES.find(c => c.value === truck.container_type)?.label
  const isOwnTruck = isCarrier && truck.carrier_id === user?.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carrier = (truck as any).carrier

  const trailerLabel = truck.trailer_type
    ? (TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type)
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notes = (truck as any).notes as string | null | undefined

  return (
    <AppLayout>
      <div className="max-w-2xl">
        {/* Навигация */}
        <Link
          href={isOwnTruck ? '/my-trucks' : '/trucks'}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink transition-colors ease-terminal mb-5"
        >
          <ArrowLeft size={16} /> {isOwnTruck ? 'Мои машины' : 'Найти машину'}
        </Link>

        {/* Карточка машины */}
        <div className="bg-surface rounded-card border border-hairline p-6 mb-6">
          {/* Статус доступности */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <StatusPill status={truck.status} kind="truck" label={TRUCK_STATUS_LABEL[truck.status] ?? truck.status} />
          </div>

          {/* Герой-маршрут: крупные города, пунктирная рельса */}
          <div className="mb-6">
            <div className="flex items-stretch gap-3 flex-col sm:flex-row sm:items-center">
              {/* Точка А */}
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-2 w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-[28px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">{truck.from_city}</div>
                </div>
              </div>

              {/* Рельса — узел с accent-кольцом */}
              <div className="hidden sm:flex items-center flex-none px-1 self-start mt-4 min-w-[36px]">
                <span className="flex-1 rail" />
                <span className="w-3 h-3 rounded-full bg-surface border-2 border-accent ring-2 ring-accent-soft mx-[3px] flex-none" />
                <span className="flex-1 rail" />
              </div>

              {/* Точка Б */}
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-2 w-2.5 h-2.5 rounded-full bg-success shrink-0" />
                <div className="min-w-0">
                  <div className="text-[28px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">{truck.to_city}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Волосяной разделитель */}
          <div className="border-t border-hairline mb-5" />

          {/* Моно-таблица параметров */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 mb-5">
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Контейнер</div>
              <ContainerChip label={containerLabel || truck.container_type} />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Ставка</div>
              <div className="font-mono text-xl font-medium tabular-nums text-ink">{formatPrice(truck.price, truck.is_negotiable)}</div>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Готов</div>
              <div className="font-mono text-[15px] tabular-nums text-ink">{formatDate(truck.available_date)}</div>
            </div>
            {trailerLabel && (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Тип прицепа</div>
                <ContainerChip label={trailerLabel} />
              </div>
            )}
            {truck.payload && (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Грузоподъёмность</div>
                <div className="font-mono text-[15px] tabular-nums text-ink">{truck.payload} т</div>
              </div>
            )}
            {truck.long_distance && (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Дальние рейсы</div>
                <div className="inline-flex items-center gap-1.5 text-[15px] font-medium text-success">
                  <Route size={15} /> Готов
                </div>
              </div>
            )}
            {truck.has_genset && (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Genset</div>
                <div className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
                  <Zap size={15} /> Есть
                </div>
              </div>
            )}
          </div>

          {/* Особые условия */}
          {notes && (
            <div className="p-3 rounded-field bg-warning-soft border border-warning/20 mb-3">
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-warning mb-1">Особые условия</div>
              <div className="text-sm text-ink-2">{notes}</div>
            </div>
          )}

          <div className="text-[11px] text-ink-4 mt-5 font-mono tabular-nums">
            Размещено: {formatDateTime(truck.created_at)}
          </div>
        </div>

        {/* Перевозчик (для клиента) */}
        {!isOwnTruck && carrier && (
          <div className="bg-surface border border-hairline rounded-card p-5 mb-6">
            <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2.5">Перевозчик</div>
            <div className="font-semibold text-ink text-[17px] flex items-center gap-2 flex-wrap">
              {carrier.name}
              <VerifiedBadge verified={carrier.is_verified} />
            </div>
            {carrier.city && (
              <div className="flex items-center gap-1 text-sm text-ink-3 mt-0.5">
                <MapPin size={12} className="shrink-0" /> {carrier.city}
              </div>
            )}
            <div className="mt-4">
              <RevealPhone kind="truck" id={truck.id} targetUserId={carrier.id} />
            </div>
          </div>
        )}

        {/* Действия клиента */}
        {isClient && truck.status === 'active' && (
          <div className="mb-6">
            {hasResponded ? (
              <Link href={`/trucks/${id}/chat`}>
                <Button className="w-full">
                  <MessageCircle size={18} className="mr-2" /> Открыть чат
                </Button>
              </Link>
            ) : showForm ? (
              <div className="bg-surface rounded-card border border-hairline p-5 space-y-4">
                <p className="text-[15px] font-semibold text-ink">Хотите этот рейс?</p>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
                />
                <div className="flex gap-2">
                  <Button onClick={handleRespond} loading={responding} className="flex-1">
                    Откликнуться и перейти в чат
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowForm(true)} className="w-full">
                Откликнуться на рейс
              </Button>
            )}
          </div>
        )}

        {/* Отклики (для владельца машины) */}
        {isOwnTruck && (
          <>
            <div className="flex items-baseline gap-2.5 mb-3">
              <h2 className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Отклики</h2>
              <span className="font-mono text-[13px] tabular-nums text-ink-3">{responses.length}</span>
            </div>
            {responses.length === 0 ? (
              <div className="bg-surface rounded-card border border-hairline flex flex-col items-center gap-3 py-12 px-6 text-center">
                <ContainerMark size={26} className="text-ink-4" />
                <span className="text-[15px] text-ink-3">Пока никто не откликнулся</span>
              </div>
            ) : (
              <div className="space-y-3">
                {responses.map(r => {
                  const client = r.client
                  return (
                    <div key={r.id} className="bg-surface rounded-card border border-hairline p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                          <User size={18} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                            {client?.name || 'Клиент'}
                            <VerifiedBadge verified={client?.is_verified} />
                          </div>
                          {client?.city && <div className="text-sm text-ink-3">{client.city}</div>}
                          {r.message && (
                            <p className="mt-2 text-sm text-ink-2 bg-surface-sunken rounded-field p-2.5">{r.message}</p>
                          )}
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <RevealPhone kind="truck" id={truck.id} targetUserId={r.client_id} />
                            <Link
                              href={`/trucks/${id}/chat?client=${r.client_id}`}
                              className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-card bg-surface border border-hairline text-ink-2 text-sm font-medium hover:border-border-strong transition-colors ease-terminal"
                            >
                              <MessageCircle size={14} /> Чат
                            </Link>
                            {truck.status === 'active' && (
                              <Button
                                size="sm"
                                loading={acceptingClientId === r.client_id}
                                onClick={() => acceptClient(r.client_id)}
                              >
                                <CheckCircle size={14} className="mr-1" /> Принять клиента
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-ink-4 shrink-0 font-mono tabular-nums">{formatDateTime(r.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
