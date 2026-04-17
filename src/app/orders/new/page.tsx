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
import { CONTAINER_TYPES, REF_CONTAINER_TYPES, CONTAINER_TARE_WEIGHT } from '@/lib/cities'
import { ContainerType, VatType, OrderFormat } from '@/types/database'
import { toast } from 'sonner'
import { Calculator, Plus, Trash2, X } from 'lucide-react'

// Дефолтный expires_at: 7 дней от сейчас в формате datetime-local
function defaultExpiresAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(23, 59, 0, 0)
  return d.toISOString().slice(0, 16)
}

function NewOrderForm() {
  const router = useRouter()
  const { user, isEmailVerified } = useUser()
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
  const [readyTime, setReadyTime] = useState('')
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt())

  // Price & VAT
  const [price, setPrice] = useState(params.get('price') || '')
  const [isNegotiable, setIsNegotiable] = useState(params.get('negotiable') === '1')
  const [vatType, setVatType] = useState<VatType>('none')

  // Weight (container 1)
  const [weightGross, setWeightGross] = useState('')
  const [weightNet, setWeightNet] = useState('')
  // Weight (container 2 — only for 20DC2)
  const [weightGross2, setWeightGross2] = useState('')
  const [weightNet2, setWeightNet2] = useState('')
  // Простой транспорта
  const [downtimeRate, setDowntimeRate] = useState('')

  // Трекинг рейса
  const [trackingEnabled, setTrackingEnabled] = useState(false)

  // Дополнительные точки маршрута
  const [hasExtraStops, setHasExtraStops] = useState(false)
  const [stops, setStops] = useState<Array<{ address: string; comment: string }>>([{ address: '', comment: '' }])

  // Калькулятор ставки
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcMethod, setCalcMethod] = useState<1 | 2 | 3 | 4>(1)
  const [calcSubmission, setCalcSubmission] = useState('')
  const [calcKm, setCalcKm] = useState('')
  const [calcRateKm, setCalcRateKm] = useState('')
  const [calcUseOverload, setCalcUseOverload] = useState(false)
  const [calcOverload, setCalcOverload] = useState('')
  const [calcUseExtraStop, setCalcUseExtraStop] = useState(false)
  const [calcExtraStop, setCalcExtraStop] = useState('')
  const [calcMarket, setCalcMarket] = useState('')

  // Format (replaces is_urgent checkbox)
  const [format, setFormat] = useState<OrderFormat>(
    params.get('urgent') === '1' ? 'urgent' : 'regular'
  )
  const [auctionStartPrice, setAuctionStartPrice] = useState('')
  const [auctionEndTime, setAuctionEndTime] = useState('')
  const [auctionMinPrice, setAuctionMinPrice] = useState('')
  const [auctionMaxPrice, setAuctionMaxPrice] = useState('')
  const [auctionStep, setAuctionStep] = useState('')
  const [auctionUseStep, setAuctionUseStep] = useState(false)
  const [auctionAutoWinner, setAuctionAutoWinner] = useState(true)
  const [auctionAutoExtend, setAuctionAutoExtend] = useState(true)

  const [requiresGenset, setRequiresGenset] = useState(false)
  const [hidePhone, setHidePhone] = useState(false)
  const [notes, setNotes] = useState(params.get('notes') || '')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isDuplicate = params.has('from')
  const isRefContainer = REF_CONTAINER_TYPES.has(containerType)
  const isAuctionFormat = format === 'reduction' || format === 'auction'
  const is20DC2 = containerType === '20DC2'
  const tarWeight = CONTAINER_TARE_WEIGHT[containerType] ?? 0

  function handleContainerChange(v: ContainerType) {
    setContainerType(v)
    if (!REF_CONTAINER_TYPES.has(v)) setRequiresGenset(false)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = t.order.errorPoint1
    if (!toCity)   e.toCity   = t.order.errorPoint3
    if (!readyDate) e.readyDate = t.order.errorDate
    if (!isAuctionFormat && !isNegotiable && !price) e.price = t.order.errorRate
    if (!expiresAt) e.expiresAt = t.order.errorValidity
    if (isAuctionFormat && !auctionStartPrice) e.auctionStartPrice = t.order.errorStartPrice
    if (isAuctionFormat && !auctionEndTime) e.auctionEndTime = t.order.errorEndTime
    if (weightGross && weightNet && parseInt(weightNet) > parseInt(weightGross)) {
      e.weightNet = 'Нетто не может превышать брутто'
    }
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    if (!user) return
    if (!isEmailVerified) {
      toast.error('Подтвердите почту чтобы создавать заявки')
      return
    }
    setLoading(true)

    const supabase = createClient()
    const { data: inserted, error } = await supabase.from('orders').insert({
      client_id: user.id,
      format,
      from_city: fromCity,
      from_city_address: fromCityAddress.trim() || null,
      via_city: viaCity,
      via_city_address: viaCityAddress.trim() || null,
      to_city: toCity,
      to_city_address: toCityAddress.trim() || null,
      container_type: containerType,
      ready_date: readyDate,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      ready_time: readyTime || null,
      price: isAuctionFormat ? null : (isNegotiable ? null : parseInt(price)),
      is_negotiable: isAuctionFormat ? false : isNegotiable,
      is_urgent: format === 'urgent',
      vat_type: vatType,
      hide_phone: hidePhone,
      weight_gross: weightGross ? parseInt(weightGross) : null,
      weight_net:   weightNet   ? parseInt(weightNet)   : null,
      weight_gross_2: is20DC2 && weightGross2 ? parseInt(weightGross2) : null,
      weight_net_2:   is20DC2 && weightNet2   ? parseInt(weightNet2)   : null,
      downtime_rate: downtimeRate ? parseInt(downtimeRate) : null,
      tracking_enabled: trackingEnabled,
      requires_genset: requiresGenset,
      notes: notes.trim() || null,
      arrival_time: null,
      auction_start_price: isAuctionFormat ? parseInt(auctionStartPrice) : null,
      auction_end_time: isAuctionFormat ? new Date(auctionEndTime).toISOString() : null,
      auction_min_price: isAuctionFormat && auctionMinPrice ? parseInt(auctionMinPrice) : null,
      auction_max_price: isAuctionFormat && auctionMaxPrice ? parseInt(auctionMaxPrice) : null,
      auction_step: isAuctionFormat && auctionUseStep && auctionStep ? parseInt(auctionStep) : null,
      auction_auto_winner: isAuctionFormat ? auctionAutoWinner : true,
      auction_auto_extend: isAuctionFormat ? auctionAutoExtend : true,
    }).select('id').single()

    if (error || !inserted) {
      toast.error(t.order.error)
      setLoading(false)
      return
    }

    // Вставить дополнительные точки
    if (hasExtraStops) {
      const validStops = stops.filter(s => s.address.trim())
      if (validStops.length > 0) {
        await supabase.from('order_stops').insert(
          validStops.map((s, i) => ({
            order_id: inserted.id,
            address: s.address.trim(),
            comment: s.comment.trim() || null,
            sort_order: i,
          }))
        )
      }
    }

    toast.success(t.order.posted)
    router.push(isAuctionFormat ? '/auctions' : '/dashboard')
  }

  const today = new Date().toISOString().split('T')[0]
  const minExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  const minAuctionEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)

  const formatOptions: { value: OrderFormat; label: string; hint: string }[] = [
    { value: 'regular',   label: t.order.formatRegular,   hint: '' },
    { value: 'urgent',    label: t.order.formatUrgent,    hint: t.order.urgentHint },
    { value: 'reduction', label: t.order.formatReduction, hint: t.order.formatReductionHint },
    { value: 'auction',   label: t.order.formatAuction,   hint: t.order.formatAuctionHint },
  ]

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

            {/* Дополнительные точки маршрута */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={hasExtraStops}
                  onChange={e => setHasExtraStops(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">Есть дополнительные точки</div>
                  <div className="text-xs text-gray-500 mt-0.5">Промежуточные адреса погрузки / выгрузки</div>
                </div>
              </label>
              {hasExtraStops && (
                <div className="mt-3 space-y-3">
                  {stops.map((stop, i) => (
                    <div key={i} className="p-3 rounded-xl border border-gray-200 space-y-2 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-500">Точка {i + 1}</span>
                        {stops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setStops(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <Input
                        label="Адрес"
                        value={stop.address}
                        onChange={e => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, address: e.target.value } : s))}
                        placeholder="Улица, склад, терминал..."
                      />
                      <Input
                        label={`Комментарий (${t.common.optional})`}
                        value={stop.comment}
                        onChange={e => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, comment: e.target.value } : s))}
                        placeholder="Погрузка, выгрузка, таможня..."
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setStops(prev => [...prev, { address: '', comment: '' }])}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Plus size={16} /> Добавить точку
                  </button>
                </div>
              )}
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

            {/* Дата погрузки/выгрузки + время (пункты 7, 9) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.loadingDate}</label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="readyDate"
                  type="date"
                  label="Дата"
                  value={readyDate}
                  onChange={e => { setReadyDate(e.target.value); setErrors(p => ({ ...p, readyDate: '' })) }}
                  min={today}
                  error={errors.readyDate}
                />
                <Input
                  id="readyTime"
                  type="time"
                  label={`Время (${t.common.optional})`}
                  value={readyTime}
                  onChange={e => setReadyTime(e.target.value)}
                />
              </div>
            </div>

            {/* Срок действия — дата+время вручную (пункт 7) */}
            <div>
              <Input
                id="expiresAt"
                type="datetime-local"
                label={t.order.validity}
                value={expiresAt}
                onChange={e => { setExpiresAt(e.target.value); setErrors(p => ({ ...p, expiresAt: '' })) }}
                min={minExpiresAt}
                error={errors.expiresAt}
              />
              <p className="text-xs text-gray-400 mt-1">Укажите дату и время истечения заявки</p>
            </div>

            {/* Вес груза */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Вес груза <span className="text-gray-400 font-normal">({t.common.optional})</span>
              </label>
              <div className="mb-2 px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-500">
                {is20DC2
                  ? <>Тара каждого контейнера: <strong className="text-gray-700">2 200 кг</strong> · Итого тара: <strong className="text-gray-700">4 400 кг</strong></>
                  : <>Вес контейнера ({containerType}): <strong className="text-gray-700">{tarWeight.toLocaleString('ru-RU')} кг</strong></>
                }
              </div>

              {is20DC2 ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-1.5">Контейнер 1</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                        onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" />
                      <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                        onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                        placeholder="кг" min="0" error={errors.weightNet} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-1.5">Контейнер 2</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross2" type="number" label={t.order.weightGross} value={weightGross2}
                        onChange={e => setWeightGross2(e.target.value)} placeholder="кг" min="0" />
                      <Input id="weightNet2" type="number" label={t.order.weightNet} value={weightNet2}
                        onChange={e => setWeightNet2(e.target.value)} placeholder="кг" min="0" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                    onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" />
                  <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                    onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                    placeholder="кг" min="0" error={errors.weightNet} />
                </div>
              )}
            </div>

            {/* Формат заявки */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.format}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {formatOptions.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      format === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={opt.value}
                      checked={format === opt.value}
                      onChange={() => {
                        setFormat(opt.value)
                        setErrors(p => ({ ...p, auctionStartPrice: '', auctionEndTime: '' }))
                      }}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${format === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span className="text-xs text-gray-500 leading-tight">{opt.hint}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Поля для аукциона/редукциона */}
            {isAuctionFormat && (
              <div className="space-y-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
                <Input
                  id="auctionStartPrice"
                  type="number"
                  label={t.order.auctionStartPrice}
                  value={auctionStartPrice}
                  onChange={e => { setAuctionStartPrice(e.target.value); setErrors(p => ({ ...p, auctionStartPrice: '' })) }}
                  placeholder="₽"
                  min="1"
                  error={errors.auctionStartPrice}
                />
                <Input
                  id="auctionEndTime"
                  type="datetime-local"
                  label={t.order.auctionEndTime}
                  value={auctionEndTime}
                  onChange={e => { setAuctionEndTime(e.target.value); setErrors(p => ({ ...p, auctionEndTime: '' })) }}
                  min={minAuctionEnd}
                  error={errors.auctionEndTime}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="auctionMinPrice"
                    type="number"
                    label={`Мин. цена (${t.common.optional})`}
                    value={auctionMinPrice}
                    onChange={e => setAuctionMinPrice(e.target.value)}
                    placeholder="₽"
                    min="1"
                  />
                  <Input
                    id="auctionMaxPrice"
                    type="number"
                    label={`Макс. цена (${t.common.optional})`}
                    value={auctionMaxPrice}
                    onChange={e => setAuctionMaxPrice(e.target.value)}
                    placeholder="₽"
                    min="1"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={auctionUseStep}
                    onChange={e => setAuctionUseStep(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  Фиксированный шаг торгов
                </label>
                {auctionUseStep && (
                  <Input
                    id="auctionStep"
                    type="number"
                    label="Размер шага (₽)"
                    value={auctionStep}
                    onChange={e => setAuctionStep(e.target.value)}
                    placeholder="например 5000"
                    min="1"
                  />
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={auctionAutoWinner}
                    onChange={e => setAuctionAutoWinner(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  Автоматически выбрать победителя по окончании
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={auctionAutoExtend}
                    onChange={e => setAuctionAutoExtend(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  Продлить на 1 час если нет ставок
                </label>
              </div>
            )}

            {/* Ставка + НДС — скрываем для аукционов */}
            {!isAuctionFormat && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">{t.order.rate}</label>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
                  >
                    <Calculator size={13} /> Рассчитать ставку
                  </button>
                </div>
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
            )}

            {/* НДС */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.vatType}</label>
              <div className="flex gap-2 flex-wrap">
                {(['none', 'vat5', 'vat15', 'vat20', 'vat0'] as VatType[]).map(v => (
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
                    {v === 'none' ? t.order.vatNone : v === 'vat5' ? t.order.vatVat5 : v === 'vat15' ? t.order.vatVat15 : v === 'vat20' ? t.order.vatVat20 : t.order.vatVat0}
                  </label>
                ))}
              </div>
            </div>

            {/* Скрыть номер телефона */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={hidePhone}
                onChange={e => setHidePhone(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Общаться только через чат (скрыть номер телефона)</div>
                <div className="text-xs text-gray-500 mt-0.5">Перевозчики не будут видеть ваш номер — только кнопку чата</div>
              </div>
            </label>

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

            {/* Простой транспорта */}
            <div>
              <Input
                id="downtimeRate"
                type="number"
                label={`Простой транспорта (₽/час) — ${t.common.optional}`}
                value={downtimeRate}
                onChange={e => setDowntimeRate(e.target.value)}
                placeholder="например: 500"
                min="0"
              />
              <p className="text-xs text-gray-400 mt-1">Указывается после выполнения перевозки</p>
            </div>

            {/* Трекинг рейса */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={trackingEnabled}
                onChange={e => setTrackingEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">📍 Онлайн-трекинг рейса</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Перевозчик будет отмечать этапы поездки (7 шагов), вы увидите статус в реальном времени
                </div>
              </div>
            </label>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {t.order.post}
            </Button>
          </form>
        </div>
      </div>
      {/* Калькулятор ставки */}
      {calcOpen && (() => {
        const sub = parseInt(calcSubmission) || 0
        const km  = parseFloat(calcKm) || 0
        const rateKm = parseFloat(calcRateKm) || 0
        const overload  = calcUseOverload  ? (parseInt(calcOverload)  || 0) : 0
        const extraStop = calcUseExtraStop ? (parseInt(calcExtraStop) || 0) : 0

        let total = 0
        if (calcMethod === 1) total = sub + km * rateKm * 2 + overload + extraStop
        if (calcMethod === 2) total = sub + km * rateKm     + overload + extraStop
        if (calcMethod === 3) total = sub + km * rateKm     + overload + extraStop
        if (calcMethod === 4) total = parseInt(calcMarket) || 0

        const methodLabels = ['', 'Составная (туда-обратно)', 'Составная (в один конец)', 'МКАДный', 'Рыночная']
        const kmLabel = calcMethod === 3 ? 'Км от МКАД' : 'Расстояние (км)'

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Calculator size={18} className="text-blue-600" /> Калькулятор ставки
                </h2>
                <button onClick={() => setCalcOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Метод */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Метод расчёта</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2, 3, 4] as const).map(m => (
                      <label key={m} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors ${calcMethod === m ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        <input type="radio" name="calcMethod" checked={calcMethod === m} onChange={() => setCalcMethod(m)} className="sr-only" />
                        {methodLabels[m]}
                      </label>
                    ))}
                  </div>
                </div>

                {calcMethod !== 4 ? (
                  <>
                    <Input label="Подача (₽)" type="number" value={calcSubmission} onChange={e => setCalcSubmission(e.target.value)} placeholder="0" min="0" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label={kmLabel} type="number" value={calcKm} onChange={e => setCalcKm(e.target.value)} placeholder="0" min="0" />
                      <Input label="Ставка за км (₽/км)" type="number" value={calcRateKm} onChange={e => setCalcRateKm(e.target.value)} placeholder="0" min="0" />
                    </div>
                    {calcMethod === 1 && (
                      <p className="text-xs text-gray-400">Км × ставку × 2 (туда и обратно)</p>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={calcUseOverload} onChange={e => setCalcUseOverload(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      Перегруз
                      {calcUseOverload && (
                        <Input label="" type="number" value={calcOverload} onChange={e => setCalcOverload(e.target.value)} placeholder="₽" min="0" />
                      )}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={calcUseExtraStop} onChange={e => setCalcUseExtraStop(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      Доп. точка
                      {calcUseExtraStop && (
                        <Input label="" type="number" value={calcExtraStop} onChange={e => setCalcExtraStop(e.target.value)} placeholder="₽" min="0" />
                      )}
                    </label>
                  </>
                ) : (
                  <Input label="Рыночная ставка (₽)" type="number" value={calcMarket} onChange={e => setCalcMarket(e.target.value)} placeholder="0" min="0" />
                )}

                {/* Итог */}
                {total > 0 && (
                  <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                    <span className="text-sm text-blue-700">Итого:</span>
                    <span className="text-lg font-bold text-blue-800">{total.toLocaleString('ru-RU')} ₽</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-5 border-t border-gray-100">
                <Button
                  onClick={() => { if (total > 0) { setPrice(String(total)); setIsNegotiable(false); setCalcOpen(false) } }}
                  disabled={total <= 0}
                  className="flex-1"
                >
                  Применить
                </Button>
                <Button variant="secondary" onClick={() => setCalcOpen(false)}>Отмена</Button>
              </div>
            </div>
          </div>
        )
      })()}
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
