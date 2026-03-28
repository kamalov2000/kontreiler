'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { CONTAINER_TYPES } from '@/lib/cities'
import { ContainerType } from '@/types/database'
import { toast } from 'sonner'

function NewOrderForm() {
  const router = useRouter()
  const { user } = useUser()
  const params = useSearchParams()

  const [fromCity, setFromCity] = useState(params.get('from') || '')
  const [toCity, setToCity] = useState(params.get('to') || '')
  const [containerType, setContainerType] = useState<ContainerType>(
    (params.get('container') as ContainerType) || '20ft'
  )
  const [readyDate, setReadyDate] = useState(params.get('date') || '')
  const [price, setPrice] = useState(params.get('price') || '')
  const [isNegotiable, setIsNegotiable] = useState(params.get('negotiable') === '1')
  const [isUrgent, setIsUrgent] = useState(params.get('urgent') === '1')
  const [notes, setNotes] = useState(params.get('notes') || '')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDuplicate = params.has('from')

  function validate() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = 'Укажите город отправления'
    if (!toCity) e.toCity = 'Укажите город назначения'
    if (!readyDate) e.readyDate = 'Укажите дату'
    if (!isNegotiable && !price) e.price = 'Укажите ставку или выберите "Договорная"'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    if (!user) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from('orders').insert({
      client_id: user.id,
      from_city: fromCity,
      to_city: toCity,
      container_type: containerType,
      ready_date: readyDate,
      price: isNegotiable ? null : parseInt(price),
      is_negotiable: isNegotiable,
      is_urgent: isUrgent,
      notes: notes.trim() || null,
    })

    if (error) {
      toast.error('Ошибка создания заявки')
      setLoading(false)
      return
    }

    toast.success('Заявка размещена!')
    router.push('/dashboard')
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <AppLayout>
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {isDuplicate ? 'Дублировать заявку' : 'Новая заявка'}
        </h1>
        {isDuplicate && (
          <p className="text-sm text-gray-500 mb-6">Параметры скопированы — отредактируйте при необходимости</p>
        )}
        {!isDuplicate && <div className="mb-6" />}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CityAutocomplete
                id="fromCity"
                label="Откуда"
                value={fromCity}
                onChange={v => { setFromCity(v); setErrors(p => ({ ...p, fromCity: '' })) }}
                placeholder="Город отправления"
                error={errors.fromCity}
              />
              <CityAutocomplete
                id="toCity"
                label="Куда"
                value={toCity}
                onChange={v => { setToCity(v); setErrors(p => ({ ...p, toCity: '' })) }}
                placeholder="Город назначения"
                error={errors.toCity}
              />
            </div>

            <Select
              id="containerType"
              label="Тип контейнера"
              value={containerType}
              onChange={e => setContainerType(e.target.value as ContainerType)}
              options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
            />

            <Input
              id="readyDate"
              type="date"
              label="Дата готовности груза"
              value={readyDate}
              onChange={e => { setReadyDate(e.target.value); setErrors(p => ({ ...p, readyDate: '' })) }}
              min={today}
              error={errors.readyDate}
            />

            {/* Ставка */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ставка</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNegotiable}
                    onChange={e => {
                      setIsNegotiable(e.target.checked)
                      if (e.target.checked) setPrice('')
                      setErrors(p => ({ ...p, price: '' }))
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Договорная</span>
                </label>
              </div>
              {!isNegotiable && (
                <Input
                  id="price"
                  type="number"
                  placeholder="Ставка в рублях"
                  value={price}
                  onChange={e => { setPrice(e.target.value); setErrors(p => ({ ...p, price: '' })) }}
                  min="0"
                  error={errors.price}
                />
              )}
            </div>

            {/* Особые условия */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="notes">
                Особые условия <span className="text-gray-400 font-normal">(необязательно)</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Рефрижератор, опасный груз, негабарит, боковая загрузка..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Срочно */}
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={e => setIsUrgent(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-red-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">🔴 Срочная заявка</div>
                <div className="text-xs text-gray-500">Будет выделена в ленте перевозчиков</div>
              </div>
            </label>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Разместить заявку
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    }>
      <NewOrderForm />
    </Suspense>
  )
}
