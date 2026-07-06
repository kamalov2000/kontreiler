'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Filter, X } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck } from '@/types/database'
import { formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'

function readyShort(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function TrucksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()

  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [carrierRatings, setCarrierRatings] = useState<Record<string, { avg: number; count: number }>>({})

  const fromFilter = searchParams.get('from') || ''
  const toFilter = searchParams.get('to') || ''
  const typeFilter = searchParams.get('type') || ''

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/trucks?${params.toString()}`)
  }

  useEffect(() => {
    if (!user) return
    setLoading(true)

    async function fetch() {
      const supabase = createClient()
      let query = supabase
        .from('trucks')
        .select('*, carrier:users!carrier_id(id, name, city, is_verified)')
        .eq('status', 'active')
        .order('available_date', { ascending: true })

      if (fromFilter) query = query.ilike('from_city', `%${fromFilter}%`)
      if (toFilter) query = query.ilike('to_city', `%${toFilter}%`)
      if (typeFilter) query = query.eq('container_type', typeFilter)

      const { data } = await query
      const loaded = (data || []) as Truck[]
      setTrucks(loaded)
      setLoading(false)

      // Рейтинги перевозчиков
      const carrierIds = loaded.map(t => t.carrier_id).filter((v, i, a) => a.indexOf(v) === i)
      if (carrierIds.length > 0) {
        const { data: ratings } = await supabase
          .from('user_avg_ratings')
          .select('user_id, avg_rating, review_count')
          .in('user_id', carrierIds)
        if (ratings) {
          const map: Record<string, { avg: number; count: number }> = {}
          for (const r of ratings) map[r.user_id] = { avg: r.avg_rating, count: r.review_count }
          setCarrierRatings(map)
        }
      }
    }
    fetch()
  }, [user, fromFilter, toFilter, typeFilter])

  // Realtime subscription
  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    const channel = supabase
      .channel('trucks-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trucks' },
        async () => {
          // Refetch on any change
          let query = supabase
            .from('trucks')
            .select('*, carrier:users!carrier_id(id, name, city, is_verified)')
            .eq('status', 'active')
            .order('available_date', { ascending: true })

          if (fromFilter) query = query.ilike('from_city', `%${fromFilter}%`)
          if (toFilter) query = query.ilike('to_city', `%${toFilter}%`)
          if (typeFilter) query = query.eq('container_type', typeFilter)

          const { data } = await query
          setTrucks((data || []) as Truck[])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, fromFilter, toFilter, typeFilter])

  const hasFilters = fromFilter || toFilter || typeFilter

  return (
    <AppLayout>
      {/* Шапка ленты */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Найти машину</h1>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />Live
          </span>
          {!loading && (
            <span className="font-mono text-[13px] tabular-nums text-ink-3">{trucks.length} свободных</span>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 h-9 rounded-card text-sm transition-colors ${
            hasFilters ? 'bg-accent text-white' : 'bg-surface border border-hairline text-ink-2 hover:border-border-strong'
          }`}
        >
          <Filter size={16} />
          Фильтры
          {hasFilters && (
            <span className="w-4 h-4 rounded-full bg-white text-accent text-xs flex items-center justify-center font-bold">
              {[fromFilter, toFilter, typeFilter].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Панель фильтров */}
      {showFilters && (
        <div className="bg-surface rounded-card border border-hairline p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CityAutocomplete
              label="Откуда"
              value={fromFilter}
              onChange={v => applyFilter('from', v)}
              placeholder="Любой город"
            />
            <CityAutocomplete
              label="Куда"
              value={toFilter}
              onChange={v => applyFilter('to', v)}
              placeholder="Любой город"
            />
            <Select
              label="Тип контейнера"
              value={typeFilter}
              onChange={e => applyFilter('type', e.target.value)}
              options={TRUCK_CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              placeholder="Любой тип"
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => router.push('/trucks')}
              className="mt-3 flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
            >
              <X size={14} /> Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {/* Доска */}
      <div className="border border-hairline rounded-card bg-surface overflow-x-auto">
        <div className="min-w-[856px]">
          {/* Шапка колонок */}
          <div className="flex items-center gap-3.5 h-[34px] px-5 bg-surface-sunken border-b border-hairline text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
            <span className="w-[84px] flex-none">Номер</span>
            <span className="flex-1 min-w-[160px]">Маршрут</span>
            <span className="w-[140px] flex-none">Контейнер</span>
            <span className="w-[150px] flex-none">Параметры</span>
            <span className="w-[64px] flex-none text-right">Готов</span>
            <span className="w-[110px] flex-none text-right">Ставка</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
                <span className="w-[84px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[140px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[110px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
            ))
          ) : trucks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
              <ContainerMark size={28} className="text-ink-4" />
              <span className="text-[15px] text-ink-3 max-w-[320px]">
                {hasFilters ? 'По этим фильтрам свободных машин не найдено.' : 'Пока нет свободных машин на доске.'}
              </span>
              {hasFilters && (
                <button onClick={() => router.push('/trucks')} className="text-sm font-medium text-accent hover:text-accent-hover">
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            trucks.map(truck => {
              const containerLabel = TRUCK_CONTAINER_TYPES.find(c => c.value === truck.container_type)?.label || truck.container_type
              const carrier = truck.carrier
              const rating = carrierRatings[truck.carrier_id]
              const trailerLabel = truck.trailer_type
                ? (TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type)
                : null
              return (
                <Link
                  key={truck.id}
                  href={`/trucks/${truck.id}`}
                  className="flex items-center gap-3.5 min-h-[56px] py-2 px-5 border-b border-hairline last:border-0 bg-surface cursor-pointer transition-colors ease-terminal hover:bg-accent-soft hover:shadow-row-active"
                >
                  <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3 truncate">
                    {truck.truck_number || '—'}
                  </span>
                  <span className="flex-1 min-w-[160px] overflow-hidden flex items-center gap-2">
                    <RouteInline
                      className="flex-1 min-w-0"
                      from={truck.from_city}
                      to={truck.to_city}
                    />
                    {carrier?.name && (
                      <span className="text-xs text-ink-3 whitespace-nowrap truncate max-w-[140px] inline-flex items-center gap-1">
                        <span className="truncate">{carrier.name}{carrier.city ? ` · ${carrier.city}` : ''}</span>
                        <VerifiedBadge verified={carrier.is_verified} iconOnly />
                      </span>
                    )}
                    {rating && (
                      <span className="font-mono text-[12px] text-ink-3 flex-none whitespace-nowrap">★ {rating.avg.toFixed(1)}</span>
                    )}
                  </span>
                  <span className="w-[140px] flex-none">
                    <ContainerChip label={containerLabel} wrap />
                  </span>
                  <span className="w-[150px] flex-none flex flex-wrap items-center gap-1 leading-tight">
                    {trailerLabel && (
                      <span className="px-1.5 py-0.5 rounded-field border border-hairline bg-surface-sunken text-[11px] text-ink-2 whitespace-nowrap">
                        {trailerLabel}
                      </span>
                    )}
                    {truck.payload && (
                      <span className="px-1.5 py-0.5 rounded-field border border-hairline bg-surface-sunken font-mono text-[11px] tabular-nums text-ink-2 whitespace-nowrap">
                        до {truck.payload} т
                      </span>
                    )}
                    {truck.long_distance && (
                      <span className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-success whitespace-nowrap">
                        Дальние
                      </span>
                    )}
                    {!trailerLabel && !truck.payload && !truck.long_distance && (
                      <span className="text-ink-4 text-[13px]">—</span>
                    )}
                  </span>
                  <span className="w-[64px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
                    {readyShort(truck.available_date)}
                  </span>
                  <span className="w-[110px] flex-none text-right font-mono text-[15px] font-medium tabular-nums text-ink">
                    {formatPrice(truck.price, truck.is_negotiable)}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </AppLayout>
  )
}

export default function TrucksPage() {
  return (
    <Suspense>
      <TrucksContent />
    </Suspense>
  )
}
