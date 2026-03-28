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
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { CONTAINER_TYPES } from '@/lib/cities'
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
        <Link href="/my-trucks" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-6">
          <ArrowLeft size={16} /> Мои машины
        </Link>

        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isDuplicate ? 'Дублировать рейс' : 'Разместить машину'}
          </h1>
          {savedRoutes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRoutes(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Bookmark size={14} />
              Мои маршруты
            </button>
          )}
        </div>
        {isDuplicate && (
          <p className="text-sm text-gray-500 mb-6">Параметры скопированы — отредактируйте при необходимости</p>
        )}
        {!isDuplicate && <div className="mb-6" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
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
              options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              placeholder="Выберите тип"
              error={errors.containerType}
            />
            <Input
              label="Дата готовности"
              type="date"
              value={availableDate}
              onChange={e => setAvailableDate(e.target.value)}
              min={today}
              error={errors.availableDate}
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-3">
              <input
                id="negotiable"
                type="checkbox"
                checked={isNegotiable}
                onChange={e => setIsNegotiable(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="negotiable" className="text-sm font-medium text-gray-700">
                Ставка договорная
              </label>
            </div>
            {!isNegotiable && (
              <Input
                label="Ставка (₽)"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Например: 120000"
                min="0"
                error={errors.price}
              />
            )}
          </div>

          {/* Особые условия */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="notes">
              Особые условия <span className="text-gray-400 font-normal">(необязательно)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Рефрижератор, боковая загрузка, допуск ADR..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
            >
              <span className="font-medium text-gray-900">
                {r.from_city} → {r.to_city}
              </span>
              {r.container_type && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {r.container_type}
                </span>
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
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    }>
      <NewTruckForm />
    </Suspense>
  )
}
