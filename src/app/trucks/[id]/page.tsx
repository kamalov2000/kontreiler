'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react'
import { RevealPhone } from '@/components/ui/RevealPhone'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck, TruckResponse } from '@/types/database'
import { formatDate, formatDateTime, formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { TRUCK_STATUS_LABEL, TRUCK_STATUS_CLASS } from '@/lib/status'
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
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (!truck) return null

  const containerLabel = TRUCK_CONTAINER_TYPES.find(c => c.value === truck.container_type)?.label
  const isOwnTruck = isCarrier && truck.carrier_id === user?.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carrier = (truck as any).carrier

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <Link
          href={isOwnTruck ? '/my-trucks' : '/trucks'}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-6"
        >
          <ArrowLeft size={16} /> {isOwnTruck ? 'Мои машины' : 'Найти машину'}
        </Link>

        {/* Truck card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRUCK_STATUS_CLASS[truck.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {TRUCK_STATUS_LABEL[truck.status] ?? truck.status}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-gray-900">{truck.from_city}</span>
            <ArrowRight size={20} className="text-gray-400" />
            <span className="text-2xl font-bold text-gray-900">{truck.to_city}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Контейнер</div>
              <div className="font-medium text-gray-900">{containerLabel}</div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Ставка</div>
              <div className="font-medium text-blue-700">{formatPrice(truck.price, truck.is_negotiable)}</div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Готов</div>
              <div className="font-medium text-gray-900">{formatDate(truck.available_date)}</div>
            </div>
            {truck.trailer_type && (
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="text-xs text-gray-500 mb-0.5">Тип прицепа</div>
                <div className="font-medium text-gray-900">
                  {TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type}
                </div>
              </div>
            )}
            {truck.payload && (
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="text-xs text-gray-500 mb-0.5">Грузоподъёмность</div>
                <div className="font-medium text-gray-900">{truck.payload} т</div>
              </div>
            )}
            {truck.long_distance && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                <div className="text-xs text-green-600 mb-0.5">Дальние рейсы</div>
                <div className="font-medium text-green-800">🛣️ Готов</div>
              </div>
            )}
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(truck as any).notes && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-xs text-amber-600 mb-0.5">Особые условия</div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <div className="text-sm text-amber-900">{(truck as any).notes}</div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            Размещено: {formatDateTime(truck.created_at)}
          </div>
        </div>

        {/* Carrier info (for clients) */}
        {!isOwnTruck && carrier && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <div className="text-xs text-gray-500 mb-2">Перевозчик</div>
            <div className="font-semibold text-gray-900">{carrier.name}</div>
            {carrier.city && <div className="text-sm text-gray-500 mt-0.5">{carrier.city}</div>}
            <div className="mt-2">
              <RevealPhone kind="truck" id={truck.id} targetUserId={carrier.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" />
            </div>
          </div>
        )}

        {/* Client actions */}
        {isClient && truck.status === 'active' && (
          <div className="mb-6">
            {hasResponded ? (
              <Link href={`/trucks/${id}/chat`}>
                <Button className="w-full">
                  <MessageCircle size={18} className="mr-2" /> Открыть чат
                </Button>
              </Link>
            ) : showForm ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Хотите этот рейс?</p>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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

        {/* Carrier sees responses */}
        {isOwnTruck && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Отклики ({responses.length})
            </h2>
            {responses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                Пока никто не откликнулся
              </div>
            ) : (
              <div className="space-y-3">
                {responses.map(r => {
                  const client = r.client
                  return (
                    <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <div className="font-semibold text-gray-900">{client?.name || 'Клиент'}</div>
                      {client?.city && <div className="text-sm text-gray-500">{client.city}</div>}
                      {r.message && (
                        <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{r.message}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <RevealPhone kind="truck" id={truck.id} targetUserId={r.client_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors" />
                        <Link
                          href={`/trucks/${id}/chat?client=${r.client_id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                          <MessageCircle size={14} /> Чат
                        </Link>
                        {truck.status === 'active' && (
                          <button
                            onClick={() => acceptClient(r.client_id)}
                            disabled={acceptingClientId === r.client_id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            {acceptingClientId === r.client_id ? '...' : 'Принять клиента'}
                          </button>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">{formatDateTime(r.created_at)}</div>
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
