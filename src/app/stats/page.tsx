'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { BarChart2, TrendingUp, Package, Banknote, Star } from 'lucide-react'

interface MonthBar {
  label: string
  value: number
}

interface ClientStats {
  total_trips: number
  month_trips: number
  total_sum: number
  top_carriers: { name: string; city: string | null; trips: number }[]
  monthly: MonthBar[]
}

interface CarrierStats {
  total_trips: number
  total_sum: number
  avg_rating: number
  rating_count: number
  top_routes: { from_city: string; to_city: string; trips: number }[]
  monthly: MonthBar[]
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'blue',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    amber:  'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function BarChartWidget({ title, bars, formatValue }: {
  title: string
  bars: MonthBar[]
  formatValue: (v: number) => string
}) {
  const max = Math.max(...bars.map(b => b.value), 1)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-5">{title}</h2>
      <div className="flex items-end gap-2 h-32">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-xs text-gray-500 font-medium truncate w-full text-center">
              {bar.value > 0 ? formatValue(bar.value) : ''}
            </div>
            <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
              <div
                className="w-full rounded-t-md bg-blue-500 transition-all"
                style={{ height: `${Math.round((bar.value / max) * 80)}px`, minHeight: bar.value > 0 ? '4px' : '0' }}
              />
            </div>
            <div className="text-xs text-gray-400 truncate w-full text-center">{bar.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Последние 6 календарных месяцев включая текущий */
function getLast6Months(): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('ru-RU', { month: 'short' }).replace('.', '')
    months.push({ key, label })
  }
  return months
}

function orderMonth(createdAt: string) {
  return createdAt.slice(0, 7)
}

export default function StatsPage() {
  const { user, loading: userLoading } = useUser()
  const [clientStats, setClientStats] = useState<ClientStats | null>(null)
  const [carrierStats, setCarrierStats] = useState<CarrierStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading || !user) return

    async function fetchStats() {
      const supabase = createClient()
      const now = new Date()
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const months = getLast6Months()

      if (user!.role === 'client') {
        const { data: allOrders } = await supabase
          .from('orders')
          .select('id, agreed_price, accepted_carrier_id, created_at')
          .eq('client_id', user!.id)
          .eq('status', 'delivered')

        const total_trips = allOrders?.length || 0
        const month_trips = allOrders?.filter(o => o.created_at >= firstOfMonth).length || 0
        const total_sum = allOrders?.reduce((s, o) => s + (o.agreed_price || 0), 0) || 0

        // Топ перевозчиков
        const carrierCount: Record<string, number> = {}
        for (const o of allOrders || []) {
          if (o.accepted_carrier_id) {
            carrierCount[o.accepted_carrier_id] = (carrierCount[o.accepted_carrier_id] || 0) + 1
          }
        }
        const topCarrierIds = Object.entries(carrierCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => id)

        let top_carriers: ClientStats['top_carriers'] = []
        if (topCarrierIds.length > 0) {
          const { data: carriers } = await supabase
            .from('users')
            .select('id, name, city')
            .in('id', topCarrierIds)
          top_carriers = topCarrierIds.map(id => {
            const c = carriers?.find(u => u.id === id)
            return { name: c?.name || '—', city: c?.city || null, trips: carrierCount[id] }
          })
        }

        // График: рейсы по месяцам
        const monthCount: Record<string, number> = {}
        for (const o of allOrders || []) {
          const m = orderMonth(o.created_at)
          monthCount[m] = (monthCount[m] || 0) + 1
        }
        const monthly: MonthBar[] = months.map(({ key, label }) => ({
          label,
          value: monthCount[key] || 0,
        }))

        setClientStats({ total_trips, month_trips, total_sum, top_carriers, monthly })

      } else {
        const { data: allOrders } = await supabase
          .from('orders')
          .select('id, agreed_price, from_city, to_city, created_at')
          .eq('accepted_carrier_id', user!.id)
          .eq('status', 'delivered')

        const total_trips = allOrders?.length || 0
        const total_sum = allOrders?.reduce((s, o) => s + (o.agreed_price || 0), 0) || 0

        // Топ маршрутов
        const routeCount: Record<string, { from_city: string; to_city: string; trips: number }> = {}
        for (const o of allOrders || []) {
          const key = `${o.from_city}→${o.to_city}`
          if (!routeCount[key]) routeCount[key] = { from_city: o.from_city, to_city: o.to_city, trips: 0 }
          routeCount[key].trips += 1
        }
        const top_routes = Object.values(routeCount)
          .sort((a, b) => b.trips - a.trips)
          .slice(0, 3)

        // Рейтинг
        const { data: reviewData } = await supabase
          .from('reviews')
          .select('rating')
          .eq('reviewee_id', user!.id)
        const avg_rating = reviewData && reviewData.length > 0
          ? Math.round((reviewData.reduce((s, r) => s + r.rating, 0) / reviewData.length) * 10) / 10
          : 0
        const rating_count = reviewData?.length || 0

        // График: заработок по месяцам
        const monthSum: Record<string, number> = {}
        for (const o of allOrders || []) {
          const m = orderMonth(o.created_at)
          monthSum[m] = (monthSum[m] || 0) + (o.agreed_price || 0)
        }
        const monthly: MonthBar[] = months.map(({ key, label }) => ({
          label,
          value: monthSum[key] || 0,
        }))

        setCarrierStats({ total_trips, total_sum, avg_rating, rating_count, top_routes, monthly })
      }

      setLoading(false)
    }

    fetchStats()
  }, [user, userLoading])

  if (userLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  const monthName = new Date().toLocaleString('ru-RU', { month: 'long' })

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <BarChart2 size={24} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Моя статистика</h1>
        </div>

        {user?.role === 'client' && clientStats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <StatCard icon={Package} label="Всего рейсов" value={clientStats.total_trips} />
              <StatCard icon={TrendingUp} label={`Рейсов в ${monthName}`} value={clientStats.month_trips} color="green" />
              <StatCard
                icon={Banknote}
                label="Общая сумма рейсов"
                value={clientStats.total_sum > 0 ? `${clientStats.total_sum.toLocaleString('ru-RU')} ₽` : '—'}
                color="amber"
              />
            </div>

            <div className="mb-4">
              <BarChartWidget
                title="Рейсы по месяцам"
                bars={clientStats.monthly}
                formatValue={v => String(v)}
              />
            </div>

            {clientStats.top_carriers.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
                <h2 className="font-semibold text-gray-900 mb-4">Топ-3 перевозчика</h2>
                <div className="space-y-3">
                  {clientStats.top_carriers.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{c.name}</div>
                        {c.city && <div className="text-sm text-gray-500">{c.city}</div>}
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
                        {c.trips} {c.trips === 1 ? 'рейс' : c.trips < 5 ? 'рейса' : 'рейсов'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientStats.total_trips === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-40" />
                <p>Ещё нет завершённых рейсов</p>
              </div>
            )}
          </>
        )}

        {user?.role === 'carrier' && carrierStats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <StatCard icon={Package} label="Выполнено рейсов" value={carrierStats.total_trips} />
              <StatCard
                icon={Banknote}
                label="Заработано"
                value={carrierStats.total_sum > 0 ? `${carrierStats.total_sum.toLocaleString('ru-RU')} ₽` : '—'}
                color="amber"
              />
              <StatCard
                icon={Star}
                label={`Рейтинг (${carrierStats.rating_count})`}
                value={carrierStats.avg_rating > 0 ? `${carrierStats.avg_rating} ★` : '—'}
                color="purple"
              />
            </div>

            <div className="mb-4">
              <BarChartWidget
                title="Заработок по месяцам"
                bars={carrierStats.monthly}
                formatValue={v => `${(v / 1000).toFixed(0)}к`}
              />
            </div>

            {carrierStats.top_routes.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
                <h2 className="font-semibold text-gray-900 mb-4">Топ-3 маршрута</h2>
                <div className="space-y-3">
                  {carrierStats.top_routes.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {r.from_city} → {r.to_city}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
                        {r.trips} {r.trips === 1 ? 'рейс' : r.trips < 5 ? 'рейса' : 'рейсов'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {carrierStats.total_trips === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-40" />
                <p>Ещё нет завершённых рейсов</p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
