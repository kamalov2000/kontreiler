'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES, CONTAINER_TARE_WEIGHT } from '@/lib/cities'
import { ContainerType, VatType, OrderFormat } from '@/types/database'
import { toast } from 'sonner'
import { Calculator, Plus, Trash2, X } from 'lucide-react'

// Overline-метка секции формы (морской фрахт)
const overline = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3'
// Волосяная карточка-секция
const sectionCard = 'rounded-card border border-hairline bg-surface p-4 space-y-4'

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
  // Тара (вес пустого контейнера) — редактируемая, дефолт из словаря по типу
  const [weightTare, setWeightTare] = useState(
    String(CONTAINER_TARE_WEIGHT[(params.get('container') as ContainerType) || '20ft'] ?? '')
  )

  // Трекинг рейса
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  // Только для контрагентов
  const [counterpartiesOnly, setCounterpartiesOnly] = useState(false)

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

  function handleContainerChange(v: ContainerType) {
    setContainerType(v)
    if (!REF_CONTAINER_TYPES.has(v)) setRequiresGenset(false)
    // Подставляем дефолтную тару нового типа (клиент может её изменить)
    setWeightTare(String(CONTAINER_TARE_WEIGHT[v] ?? ''))
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
      weight_tare: !is20DC2 && weightTare ? parseInt(weightTare) : null,
      downtime_rate: downtimeRate ? parseInt(downtimeRate) : null,
      tracking_enabled: trackingEnabled,
      counterparties_only: counterpartiesOnly,
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
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">
            {isDuplicate ? t.order.duplicate : t.order.new}
          </h1>
          <ContainerMark size={20} className="text-accent self-center" />
        </div>
        {isDuplicate && <p className="text-sm text-ink-3 mb-6">{t.order.duplicateHint}</p>}
        {!isDuplicate && <div className="mb-6" />}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Маршрут */}
          <div className={sectionCard}>
            <span className={overline}>Маршрут</span>

            {/* Превью маршрута */}
            {(fromCity || toCity) && (
              <div className="rounded-field border border-hairline bg-surface-sunken px-3 py-2.5">
                <RouteInline from={fromCity || '—'} to={toCity || '—'} via={viaCity} />
              </div>
            )}

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
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
                <input
                  type="checkbox"
                  checked={hasExtraStops}
                  onChange={e => setHasExtraStops(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline accent-accent"
                />
                <div>
                  <div className="text-sm font-medium text-ink">Есть дополнительные точки</div>
                  <div className="text-xs text-ink-3 mt-0.5">Промежуточные адреса погрузки / выгрузки</div>
                </div>
              </label>
              {hasExtraStops && (
                <div className="mt-3 space-y-3">
                  {stops.map((stop, i) => (
                    <div key={i} className="p-3 rounded-field border border-hairline bg-surface-sunken space-y-2 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Точка {i + 1}</span>
                        {stops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setStops(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-danger/70 hover:text-danger transition-colors"
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
                    className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    <Plus size={16} /> Добавить точку
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Груз */}
          <div className={sectionCard}>
            <span className={overline}>Груз</span>

            {/* Тип контейнера */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.containerType}</span>
              <div className="flex flex-wrap gap-2">
                {CONTAINER_TYPES.map(c => {
                  const active = containerType === c.value
                  return (
                    <label
                      key={c.value}
                      className={`px-2.5 py-1.5 rounded-field border font-mono text-[11.5px] font-medium uppercase cursor-pointer transition-colors ease-terminal ${
                        active
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-hairline bg-surface-sunken text-ink-2 hover:border-border-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name="containerType"
                        value={c.value}
                        checked={active}
                        onChange={() => handleContainerChange(c.value as ContainerType)}
                        className="sr-only"
                      />
                      {c.label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Genset — только для REF */}
            {isRefContainer && (
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-field border border-warning bg-warning-soft transition-colors ease-terminal">
                <input
                  type="checkbox"
                  checked={requiresGenset}
                  onChange={e => setRequiresGenset(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline accent-warning"
                />
                <div>
                  <div className="text-sm font-medium text-warning">{t.order.genset}</div>
                  <div className="text-xs text-warning/80">{t.order.gensetHint}</div>
                </div>
              </label>
            )}

            {/* Вес груза */}
            <div>
              <span className={overline}>
                Вес груза <span className="text-ink-4 normal-case tracking-normal font-normal">({t.common.optional})</span>
              </span>
              {is20DC2 ? (
                <div className="mt-2 mb-2 px-3 py-2 rounded-field bg-surface-sunken text-xs text-ink-3">
                  Тара каждого контейнера: <strong className="font-mono tabular-nums text-ink-2">2 200 кг</strong> · Итого тара: <strong className="font-mono tabular-nums text-ink-2">4 400 кг</strong>
                </div>
              ) : (
                <div className="mt-2 mb-2">
                  <Input
                    id="weightTare"
                    type="number"
                    label={`Вес контейнера, тара (${containerType})`}
                    value={weightTare}
                    onChange={e => setWeightTare(e.target.value)}
                    placeholder="кг"
                    min="0"
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-ink-4 mt-1">
                    {isRefContainer
                      ? 'Ориентировочный вес — у рефконтейнеров зависит от модели холодильной установки. Скорректируйте при необходимости.'
                      : 'Подставлен типовой вес пустого контейнера. Можно изменить.'}
                  </p>
                </div>
              )}

              {is20DC2 ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-[11.5px] text-ink-3 font-semibold tracking-[0.06em] uppercase mb-1.5">Контейнер 1</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                        onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                      <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                        onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                        placeholder="кг" min="0" error={errors.weightNet} className="font-mono tabular-nums" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-ink-3 font-semibold tracking-[0.06em] uppercase mb-1.5">Контейнер 2</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross2" type="number" label={t.order.weightGross} value={weightGross2}
                        onChange={e => setWeightGross2(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                      <Input id="weightNet2" type="number" label={t.order.weightNet} value={weightNet2}
                        onChange={e => setWeightNet2(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                    onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                  <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                    onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                    placeholder="кг" min="0" error={errors.weightNet} className="font-mono tabular-nums" />
                </div>
              )}
            </div>
          </div>

          {/* Сроки */}
          <div className={sectionCard}>
            <span className={overline}>Сроки</span>

            {/* Дата погрузки/выгрузки + время (пункты 7, 9) */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.loadingDate}</span>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="readyDate"
                  type="date"
                  label="Дата"
                  value={readyDate}
                  onChange={e => { setReadyDate(e.target.value); setErrors(p => ({ ...p, readyDate: '' })) }}
                  min={today}
                  error={errors.readyDate}
                  className="font-mono tabular-nums"
                />
                <Input
                  id="readyTime"
                  type="time"
                  label={`Время (${t.common.optional})`}
                  value={readyTime}
                  onChange={e => setReadyTime(e.target.value)}
                  className="font-mono tabular-nums"
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
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-ink-4 mt-1">Укажите дату и время истечения заявки</p>
            </div>
          </div>

          {/* Формат и ставка */}
          <div className={sectionCard}>
            <span className={overline}>Формат и ставка</span>

            {/* Формат заявки */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.format}</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {formatOptions.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-field border cursor-pointer transition-colors ease-terminal ${
                      format === opt.value
                        ? 'border-accent bg-accent-soft'
                        : 'border-hairline hover:border-border-strong'
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
                    <span className={`text-sm font-medium ${format === opt.value ? 'text-accent' : 'text-ink-2'}`}>
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span className="text-xs text-ink-3 leading-tight">{opt.hint}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Поля для аукциона/редукциона */}
            {isAuctionFormat && (
              <div className="space-y-3 p-4 rounded-field border border-warning bg-warning-soft">
                <Input
                  id="auctionStartPrice"
                  type="number"
                  label={t.order.auctionStartPrice}
                  value={auctionStartPrice}
                  onChange={e => { setAuctionStartPrice(e.target.value); setErrors(p => ({ ...p, auctionStartPrice: '' })) }}
                  placeholder="₽"
                  min="1"
                  error={errors.auctionStartPrice}
                  className="font-mono tabular-nums"
                />
                <Input
                  id="auctionEndTime"
                  type="datetime-local"
                  label={t.order.auctionEndTime}
                  value={auctionEndTime}
                  onChange={e => { setAuctionEndTime(e.target.value); setErrors(p => ({ ...p, auctionEndTime: '' })) }}
                  min={minAuctionEnd}
                  error={errors.auctionEndTime}
                  className="font-mono tabular-nums"
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
                    className="font-mono tabular-nums"
                  />
                  <Input
                    id="auctionMaxPrice"
                    type="number"
                    label={`Макс. цена (${t.common.optional})`}
                    value={auctionMaxPrice}
                    onChange={e => setAuctionMaxPrice(e.target.value)}
                    placeholder="₽"
                    min="1"
                    className="font-mono tabular-nums"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionUseStep}
                    onChange={e => setAuctionUseStep(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
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
                    className="font-mono tabular-nums"
                  />
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionAutoWinner}
                    onChange={e => setAuctionAutoWinner(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
                  />
                  Автоматически выбрать победителя по окончании
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionAutoExtend}
                    onChange={e => setAuctionAutoExtend(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
                  />
                  Продлить на 1 час если нет ставок
                </label>
              </div>
            )}

            {/* Ставка + НДС — скрываем для аукционов */}
            {!isAuctionFormat && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={overline}>{t.order.rate}</span>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors px-2 py-1 rounded-field hover:bg-accent-soft"
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
                      className="w-4 h-4 rounded border-hairline accent-accent"
                    />
                    <span className="text-sm text-ink-2">{t.order.negotiable}</span>
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
                    className="font-mono tabular-nums"
                  />
                )}
              </div>
            )}

            {/* НДС */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.vatType}</span>
              <div className="flex gap-2 flex-wrap">
                {(['none', 'vat5', 'vat15', 'vat20', 'vat0'] as VatType[]).map(v => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-field border cursor-pointer transition-colors ease-terminal text-sm ${
                    vatType === v
                      ? 'border-accent bg-accent-soft text-accent font-medium'
                      : 'border-hairline text-ink-2 hover:border-border-strong'
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
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-ink-4 mt-1">Указывается после выполнения перевозки</p>
            </div>
          </div>

          {/* Дополнительно */}
          <div className={sectionCard}>
            <span className={overline}>Дополнительно</span>

            {/* Особые условия */}
            <div>
              <label className={`${overline} mb-1.5`} htmlFor="notes">
                {t.order.specialConditions} <span className="text-ink-4 normal-case tracking-normal font-normal">({t.common.optional})</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.order.specialConditionsPlaceholder}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
              />
              <p className="text-xs text-ink-4 mt-1">
                Комментарий к заявке — виден перевозчикам в ленте и в карточке заявки.
              </p>
            </div>

            {/* Скрыть номер телефона */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={hidePhone}
                onChange={e => setHidePhone(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-ink">Общаться только через чат (скрыть номер телефона)</div>
                <div className="text-xs text-ink-3 mt-0.5">Перевозчики не будут видеть ваш номер — только кнопку чата</div>
              </div>
            </label>

            {/* Трекинг рейса */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={trackingEnabled}
                onChange={e => setTrackingEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-ink">Онлайн-трекинг рейса</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  Перевозчик будет отмечать этапы поездки (7 шагов), вы увидите статус в реальном времени
                </div>
              </div>
            </label>

            {/* Только для контрагентов */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-success bg-success-soft transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={counterpartiesOnly}
                onChange={e => setCounterpartiesOnly(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-success"
              />
              <div>
                <div className="text-sm font-medium text-ink">Только для моих контрагентов</div>
                <div className="text-xs text-ink-2/80 mt-0.5">
                  Заявку увидят только перевозчики из вашего списка контрагентов
                </div>
              </div>
            </label>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            {t.order.post}
          </Button>
        </form>
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
          <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
            <div className="bg-surface rounded-modal shadow-overlay border border-hairline w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-hairline">
                <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                  <Calculator size={18} className="text-accent" /> Калькулятор ставки
                </h2>
                <button onClick={() => setCalcOpen(false)} className="p-1.5 rounded-field text-ink-3 hover:bg-surface-sunken transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Метод */}
                <div>
                  <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2">Метод расчёта</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2, 3, 4] as const).map(m => (
                      <label key={m} className={`flex items-center gap-2 px-3 py-2 rounded-field border cursor-pointer text-sm transition-colors ease-terminal ${calcMethod === m ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-hairline text-ink-2 hover:border-border-strong'}`}>
                        <input type="radio" name="calcMethod" checked={calcMethod === m} onChange={() => setCalcMethod(m)} className="sr-only" />
                        {methodLabels[m]}
                      </label>
                    ))}
                  </div>
                </div>

                {calcMethod !== 4 ? (
                  <>
                    <Input label="Подача (₽)" type="number" value={calcSubmission} onChange={e => setCalcSubmission(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label={kmLabel} type="number" value={calcKm} onChange={e => setCalcKm(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                      <Input label="Ставка за км (₽/км)" type="number" value={calcRateKm} onChange={e => setCalcRateKm(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                    </div>
                    {calcMethod === 1 && (
                      <p className="text-xs text-ink-4">Км × ставку × 2 (туда и обратно)</p>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                      <input type="checkbox" checked={calcUseOverload} onChange={e => setCalcUseOverload(e.target.checked)} className="w-4 h-4 rounded border-hairline accent-accent" />
                      Перегруз
                      {calcUseOverload && (
                        <Input label="" type="number" value={calcOverload} onChange={e => setCalcOverload(e.target.value)} placeholder="₽" min="0" className="font-mono tabular-nums" />
                      )}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                      <input type="checkbox" checked={calcUseExtraStop} onChange={e => setCalcUseExtraStop(e.target.checked)} className="w-4 h-4 rounded border-hairline accent-accent" />
                      Доп. точка
                      {calcUseExtraStop && (
                        <Input label="" type="number" value={calcExtraStop} onChange={e => setCalcExtraStop(e.target.value)} placeholder="₽" min="0" className="font-mono tabular-nums" />
                      )}
                    </label>
                  </>
                ) : (
                  <Input label="Рыночная ставка (₽)" type="number" value={calcMarket} onChange={e => setCalcMarket(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                )}

                {/* Итог */}
                {total > 0 && (
                  <div className="px-4 py-3 rounded-field bg-accent-soft border border-accent flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-accent">Итого:</span>
                    <span className="font-mono tabular-nums text-lg font-medium text-accent">{total.toLocaleString('ru-RU')} ₽</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-5 border-t border-hairline">
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
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    }>
      <NewOrderForm />
    </Suspense>
  )
}
