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
import { useLanguage } from '@/contexts/LanguageContext'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES } from '@/lib/cities'
import { ContainerType, VatType } from '@/types/database'
import { toast } from 'sonner'

type ValidityOption = '1' | '3' | '7' | '14' | 'custom'

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function NewOrderForm() {
  const router = useRouter()
  const { user } = useUser()
  const { t } = useLanguage()
  const params = useSearchParams()

  // Route points
  const [fromCity, setFromCity] = useState(params.get('from') || '')
  const [fromCityAddress, setFromCityAddress] = useState('')
  const [viaCity, setViaCity] = useState('')
  const [viaCityAddress, setViaCityAddress] = useState('')
  const [toCity, setToCity] = useState(params.get('to') || '')
  const [toCityAddress, setToCityAddress] = useState('')

  // Container & dates
  const [containerType, setContainerType] = useState<ContainerType>(
    (params.get('container') as ContainerType) || '20ft'
  )
  const [readyDate, setReadyDate] = useState(params.get('date') || '')
  const [validity, setValidity] = useState<ValidityOption>('7')
  const [customExpiryDate, setCustomExpiryDate] = useState('')

  // Price & VAT
  const [price, setPrice] = useState(params.get('price') || '')
  const [isNegotiable, setIsNegotiable] = useState(params.get('negotiable') === '1')
  const [vatType, setVatType] = useState<VatType>('none')

  // Weight
  const [weightGross, setWeightGross] = useState('')
  const [weightNet, setWeightNet] = useState('')

  // Flags
  const [isUrgent, setIsUrgent] = useState(params.get('urgent') === '1')
  const [requiresGenset, setRequiresGenset] = useState(false)
  const [notes, setNotes] = useState(params.get('notes') || '')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDuplicate = params.has('from')
  const isRefContainer = REF_CONTAINER_TYPES.has(containerType)

  function handleContainerChange(v: ContainerType) {
    setContainerType(v)
    if (!REF_CONTAINER_TYPES.has(v)) setRequiresGenset(false)
  }

  const validityOptions: { value: ValidityOption; label: string }[] = [
    { value: '1',      label: t.order.validity1 },
    { value: '3',      label: t.order.validity3 },
    { value: '7',      label: t.order.validity7 },
    { value: '14',     label: t.order.validity14 },
    { value: 'custom', label: t.order.validityCustom },
  ]

  function computeExpiresAt(): string | null {
    if (validity === 'custom') {
      return customExpiryDate ? new Date(customExpiryDate + 'T23:59:59').toISOString() : null
    }
    const days = parseInt(validity)
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(23, 59, 59, 0)
    return d.toISOString()
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = t.order.errorPoint1
    if (!viaCity)  e.viaCity  = t.order.errorPoint2
    if (!toCity)   e.toCity   = t.order.errorPoint3
    if (!readyDate) e.readyDate = t.order.errorDate
    if (!isNegotiable && !price) e.price = t.order.errorRate
    if (validity === 'custom' && !customExpiryDate) e.customExpiry = t.order.errorValidity
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    if (!user) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from('orders').insert({
      client_id: user.id,
      from_city: fromCity,
      from_city_address: fromCityAddress.trim() || null,
      via_city: viaCity,
      via_city_address: viaCityAddress.trim() || null,
      to_city: toCity,
      to_city_address: toCityAddress.trim() || null,
      container_type: containerType,
      ready_date: readyDate,
      expires_at: computeExpiresAt(),
      price: isNegotiable ? null : parseInt(price),
      is_negotiable: isNegotiable,
      vat_type: vatType,
      weight_gross: weightGross ? parseInt(weightGross) : null,
      weight_net:   weightNet   ? parseInt(weightNet)   : null,
      is_urgent: isUrgent,
      requires_genset: requiresGenset,
      notes: notes.trim() || null,
    })

    if (error) {
      toast.error(t.order.error)
      setLoading(false)
      return
    }

    toast.success(t.order.posted)
    router.push('/dashboard')
  }

  const today     = new Date().toISOString().split('T')[0]
  const minExpiry = addDays(1)

  return (
    <AppLayout>
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {isDuplicate ? t.order.duplicate : t.order.new}
        </h1>
        {isDuplicate && <p className="text-sm text-gray-500 mb-6">{t.order.duplicateHint}</p>}
        {!isDuplicate && <div className="mb-6" />}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Точка 1: Откуда */}
            <div className="space-y-2">
              <CityAutocomplete
                id="fromCity"
                label={t.order.point1Label}
                value={fromCity}
                onChange={v => { setFromCity(v); setErrors(p => ({ ...p, fromCity: '' })) }}
                placeholder={t.order.point1Placeholder}
                error={errors.fromCity}
              />
              <Input
                id="fromCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={fromCityAddress}
                onChange={e => setFromCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
            </div>

            {/* Точка 2: Промежуточная */}
            <div className="space-y-2">
              <CityAutocomplete
                id="viaCity"
                label={t.order.point2Label}
                value={viaCity}
                onChange={v => { setViaCity(v); setErrors(p => ({ ...p, viaCity: '' })) }}
                placeholder={t.order.point2Placeholder}
                error={errors.viaCity}
              />
              <Input
                id="viaCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={viaCityAddress}
                onChange={e => setViaCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
            </div>

            {/* Точка 3: Куда */}
            <div className="space-y-2">
              <CityAutocomplete
                id="toCity"
                label={t.order.point3Label}
                value={toCity}
                onChange={v => { setToCity(v); setErrors(p => ({ ...p, toCity: '' })) }}
                placeholder={t.order.point3Placeholder}
                error={errors.toCity}
              />
              <Input
                id="toCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={toCityAddress}
                onChange={e => setToCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
            </div>

            {/* Тип контейнера */}
            <Select
              id="containerType"
              label={t.order.containerType}
              value={containerType}
              onChange={e => handleContainerChange(e.target.value as ContainerType)}
              options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
            />

            {/* Genset — только для REF */}
            {isRefContainer && (
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  checked={requiresGenset}
                  onChange={e => setRequiresGenset(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-blue-900">⚡ {t.order.genset}</div>
                  <div className="text-xs text-blue-700">{t.order.gensetHint}</div>
                </div>
              </label>
            )}

            {/* Дата погрузки/выгрузки */}
            <Input
              id="readyDate"
              type="date"
              label={t.order.loadingDate}
              value={readyDate}
              onChange={e => { setReadyDate(e.target.value); setErrors(p => ({ ...p, readyDate: '' })) }}
              min={today}
              error={errors.readyDate}
            />

            {/* Срок действия */}
            <div>
              <Select
                id="validity"
                label={t.order.validity}
                value={validity}
                onChange={e => { setValidity(e.target.value as ValidityOption); setErrors(p => ({ ...p, customExpiry: '' })) }}
                options={validityOptions}
              />
              {validity === 'custom' && (
                <div className="mt-2">
                  <Input
                    id="customExpiry"
                    type="date"
                    label={t.order.validityUntil}
                    value={customExpiryDate}
                    onChange={e => { setCustomExpiryDate(e.target.value); setErrors(p => ({ ...p, customExpiry: '' })) }}
                    min={minExpiry}
                    error={errors.customExpiry}
                  />
                </div>
              )}
            </div>

            {/* Вес груза */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Вес груза <span className="text-gray-400 font-normal">({t.common.optional})</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="weightGross"
                  type="number"
                  label={t.order.weightGross}
                  value={weightGross}
                  onChange={e => setWeightGross(e.target.value)}
                  placeholder="кг"
                  min="0"
                />
                <Input
                  id="weightNet"
                  type="number"
                  label={t.order.weightNet}
                  value={weightNet}
                  onChange={e => setWeightNet(e.target.value)}
                  placeholder="кг"
                  min="0"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{t.order.weightHint}</p>
            </div>

            {/* Ставка + НДС */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.rate}</label>
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
                  <span className="text-sm text-gray-700">{t.order.negotiable}</span>
                </label>
              </div>
              {!isNegotiable && (
                <Input
                  id="price"
                  type="number"
                  placeholder={t.order.rateInRubles}
                  value={price}
                  onChange={e => { setPrice(e.target.value); setErrors(p => ({ ...p, price: '' })) }}
                  min="0"
                  error={errors.price}
                />
              )}
            </div>

            {/* НДС */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.vatType}</label>
              <div className="flex gap-2 flex-wrap">
                {(['none', 'vat20', 'vat0'] as VatType[]).map(v => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                    vatType === v
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="vatType"
                      value={v}
                      checked={vatType === v}
                      onChange={() => setVatType(v)}
                      className="sr-only"
                    />
                    {v === 'none' ? t.order.vatNone : v === 'vat20' ? t.order.vatVat20 : t.order.vatVat0}
                  </label>
                ))}
              </div>
            </div>

            {/* Особые условия */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="notes">
                {t.order.specialConditions} <span className="text-gray-400 font-normal">({t.common.optional})</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.order.specialConditionsPlaceholder}
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
                <div className="text-sm font-medium text-gray-900">{t.order.urgent}</div>
                <div className="text-xs text-gray-500">{t.order.urgentHint}</div>
              </div>
            </label>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {t.order.post}
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
