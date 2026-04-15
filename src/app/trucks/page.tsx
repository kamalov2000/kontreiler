'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Filter } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck } from '@/types/database'
import { formatDate, formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { RatingBadge } from '@/components/ui/RatingBadge'

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
        .select('*, carrier:users!carrier_id(id, name, city)')
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
            .select('*, carrier:users!carrier_id(id, name, city)')
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
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Найти машину</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasFilters || showFilters
                ? 'bg-blue-50 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Filter size={15} />
            Фильтры
            {hasFilters && <span className="ml-1 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5">!</span>}
          </button>
        </div>

        {showFilters && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
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
            {hasFilters && (
              <button
                onClick={() => router.push('/trucks')}
                className="text-sm text-gray-500 hover:text-red-500 transition-colors"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : trucks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">🚛</div>
            <p>{hasFilters ? 'Нет машин по выбранным фильтрам' : 'Нет доступных машин'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trucks.map(truck => {
              const containerLabel = TRUCK_CONTAINER_TYPES.find(c => c.value === truck.container_type)?.label || truck.container_type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const carrier = (truck as any).carrier

              const rating = carrierRatings[truck.carrier_id]
              return (
                <Link
                  key={truck.id}
                  href={`/trucks/${truck.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-lg">{truck.from_city}</span>
                      <ArrowRight size={16} className="text-gray-400 shrink-0" />
                      <span className="font-bold text-gray-900 text-lg">{truck.to_city}</span>
                    </div>
                    {truck.truck_number && (
                      <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 shrink-0">
                        {truck.truck_number}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm">{containerLabel}</span>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
                      {formatPrice(truck.price, truck.is_negotiable)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-sm">
                      Готов {formatDate(truck.available_date)}
                    </span>
                    {truck.trailer_type && (
                      <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-sm border border-gray-100">
                        {TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type}
                      </span>
                    )}
                    {truck.payload && (
                      <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-sm border border-gray-100">
                        до {truck.payload} т
                      </span>
                    )}
                    {truck.long_distance && (
                      <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                        🛣️ Дальние рейсы
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {carrier && (
                      <div className="text-sm text-gray-500">
                        {carrier.name}{carrier.city ? ` · ${carrier.city}` : ''}
                      </div>
                    )}
                    {rating && <RatingBadge avg={rating.avg} count={rating.count} />}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
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
