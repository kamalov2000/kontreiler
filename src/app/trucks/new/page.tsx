'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bookmark } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { SavedRoute } from '@/types/database'
import { toast } from 'sonner'

function NewTruckForm() {
  const router = useRouter()
  const { user } = useUser()
  const params = useSearchParams()

  const [fromCity, setFromCity] = useState(params.get('from') || '')
  const [toCity, setToCity] = useState(params.get('to') || '')
  const [containerType, setContainerType] = useState(params.get('container') || '')
  const [availableDate, setAvailableDate] = useState(params.get('date') || '')
  const [price, setPrice] = useState(params.get('price') || '')
  const [isNegotiable, setIsNegotiable] = useState(params.get('negotiable') === '1')
  const [notes, setNotes] = useState(params.get('notes') || '')
  const [payload, setPayload] = useState(params.get('payload') || '')
  const [trailerType, setTrailerType] = useState(params.get('trailer') || '')
  const [longDistance, setLongDistance] = useState(params.get('long') === '1')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [showRoutes, setShowRoutes] = useState(false)

  const isDuplicate = params.has('from')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('saved_routes')
      .select('*')
      .eq('carrier_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSavedRoutes((data || []) as SavedRoute[]))
  }, [user])

  function validate() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = 'Укажите город отправления'
    if (!toCity) e.toCity = 'Укажите город назначения'
    if (!containerType) e.containerType = 'Выберите тип контейнера'
    if (!availableDate) e.availableDate = 'Укажите дату готовности'
    if (!isNegotiable && price && isNaN(Number(price))) e.price = 'Введите корректную сумму'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !user) return
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from('trucks').insert({
      carrier_id: user.id,
      from_city: fromCity,
      to_city: toCity,
      container_type: containerType,
      available_date: availableDate,
      price: isNegotiable ? null : (price ? Number(price) : null),
      is_negotiable: isNegotiable,
      notes: notes.trim() || null,
      payload: payload ? Number(payload) : null,
      trailer_type: trailerType || null,
      long_distance: longDistance,
    })

    if (error) {
      toast.error('Ошибка при размещении машины')
      setLoading(false)
      return
    }

    toast.success('Машина размещена!')
    router.push('/my-trucks')
  }

  function applyRoute(route: SavedRoute) {
    setFromCity(route.from_city)
    setToCity(route.to_city)
    if (route.container_type) setContainerType(route.container_type)
    setShowRoutes(false)
    toast.success('Маршрут применён')
  }

  return (
    <AppLayout>
      <div className="max-w-lg">
        <Link href="/my-trucks" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink transition-colors mb-6">
          <ArrowLeft size={16} /> Мои машины
        </Link>

        <div className="flex items-center justify-between mb-1 gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">
            {isDuplicate ? 'Дублировать рейс' : 'Разместить машину'}
          </h1>
          {savedRoutes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRoutes(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-card text-[13px] font-medium bg-surface border border-hairline text-ink hover:border-border-strong transition-colors"
            >
              <Bookmark size={14} className="text-ink-3" />
              Мои маршруты
            </button>
          )}
        </div>
        {isDuplicate && (
          <p className="text-[13px] text-ink-3 mb-6">Параметры скопированы — отредактируйте при необходимости</p>
        )}
        {!isDuplicate && <div className="mb-6" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Маршрут и контейнер */}
          <div className="bg-surface rounded-card border border-hairline p-5 space-y-4">
            <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
              Маршрут
            </div>

            {/* Превью маршрута */}
            {(fromCity || toCity) && (
              <div className="rounded-field bg-surface-sunken border border-hairline px-3.5 py-2.5">
                <RouteInline from={fromCity || '—'} to={toCity || '—'} />
              </div>
            )}

            <CityAutocomplete
              label="Откуда"
              value={fromCity}
              onChange={setFromCity}
              placeholder="Город отправления"
              error={errors.fromCity}
            />
            <CityAutocomplete
              label="Куда"
              value={toCity}
              onChange={setToCity}
              placeholder="Город назначения"
              error={errors.toCity}
            />
            <Select
              label="Тип контейнера"
              value={containerType}
              onChange={e => setContainerType(e.target.value)}
              options={TRUCK_CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              placeholder="Выберите тип"
              error={errors.containerType}
            />
            <Select
              label="Тип прицепа / платформы"
              value={trailerType}
              onChange={e => setTrailerType(e.target.value)}
              options={TRAILER_TYPES.map(t => ({ value: t.value, label: t.label }))}
              placeholder="Выберите тип прицепа"
            />
            <Input
              label="Грузоподъёмность (тонн)"
              type="number"
              value={payload}
              onChange={e => setPayload(e.target.value)}
              placeholder="Например: 22"
              min="1"
              max="100"
              className="font-mono tabular-nums"
            />
            <Input
              label="Дата готовности"
              type="date"
              value={availableDate}
              onChange={e => setAvailableDate(e.target.value)}
              min={today}
              error={errors.availableDate}
              className="font-mono tabular-nums"
            />
          </div>

          {/* Условия и ставка */}
          <div className="bg-surface rounded-card border border-hairline p-5 space-y-3">
            <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
              Условия
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="longDistance"
                type="checkbox"
                checked={longDistance}
                onChange={e => setLongDistance(e.target.checked)}
                className="w-4 h-4 rounded-field border-hairline text-accent focus:ring-accent"
              />
              <div>
                <div className="text-[13px] font-medium text-ink">Готов к дальним рейсам</div>
                <div className="text-xs text-ink-3">Межрегиональные и дальние маршруты</div>
              </div>
            </label>
            <div className="h-px bg-hairline" />
            <label htmlFor="negotiable" className="flex items-center gap-3 cursor-pointer">
              <input
                id="negotiable"
                type="checkbox"
                checked={isNegotiable}
                onChange={e => setIsNegotiable(e.target.checked)}
                className="w-4 h-4 rounded-field border-hairline text-accent focus:ring-accent"
              />
              <span className="text-[13px] font-medium text-ink">
                Ставка договорная
              </span>
            </label>
            {!isNegotiable && (
              <Input
                label="Ставка (₽)"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Например: 120000"
                min="0"
                error={errors.price}
                className="font-mono tabular-nums"
              />
            )}
          </div>

          {/* Особые условия */}
          <div className="bg-surface rounded-card border border-hairline p-5">
            <label className="block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2" htmlFor="notes">
              Особые условия <span className="text-ink-4 font-medium normal-case tracking-normal">(необязательно)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Рефрижератор, боковая загрузка, допуск ADR..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Разместить машину
          </Button>
        </form>
      </div>

      {/* Saved routes picker */}
      <Modal
        open={showRoutes}
        onClose={() => setShowRoutes(false)}
        title="Выбрать из сохранённых маршрутов"
      >
        <div className="space-y-2">
          {savedRoutes.map(r => (
            <button
              key={r.id}
              onClick={() => applyRoute(r)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-card border border-hairline hover:bg-accent-soft hover:border-border-strong transition-colors text-left"
            >
              <RouteInline from={r.from_city} to={r.to_city} className="flex-1" />
              {r.container_type && (
                <ContainerChip label={r.container_type} />
              )}
            </button>
          ))}
        </div>
      </Modal>
    </AppLayout>
  )
}

export default function NewTruckPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    }>
      <NewTruckForm />
    </Suspense>
  )
}
