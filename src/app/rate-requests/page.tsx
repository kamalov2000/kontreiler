'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { RouteInline } from '@/components/ui/RouteInline'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES } from '@/lib/cities'
import { ContainerType, RateRequest, RateRequestOffer, VatType } from '@/types/database'
import { formatDateTime, vatLabel } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, EyeOff, Check, X } from 'lucide-react'

const VAT_OPTIONS: { value: VatType; label: string }[] = [
  { value: 'none',  label: 'Без НДС' },
  { value: 'vat5',  label: 'НДС 5%' },
  { value: 'vat15', label: 'НДС 15%' },
  { value: 'vat20', label: 'НДС 20%' },
  { value: 'vat0',  label: 'НДС 0%' },
]

function money(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`
}

/**
 * Запросы ставки: клиент спрашивает цену, когда груза ещё нет.
 *
 * Одна страница на обе роли — сущность общая, отличается только то, что на ней
 * делают: клиент публикует запрос и смотрит собранные ставки, перевозчик
 * отвечает ценой. Срока жизни у запроса нет: ответы приходят неделями, и
 * протухать по таймеру ему незачем — клиент закрывает его сам.
 */
export default function RateRequestsPage() {
  const { user, loading: userLoading, isEmailVerified } = useUser()
  const isClient = user?.role === 'client'

  const [requests, setRequests] = useState<RateRequest[]>([])
  const [offers, setOffers] = useState<Record<string, RateRequestOffer[]>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Создание запроса (клиент)
  const [createOpen, setCreateOpen] = useState(false)
  const [fromCity, setFromCity] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [viaCity, setViaCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [containerType, setContainerType] = useState<ContainerType>('40HC')
  const [weightGross, setWeightGross] = useState('')
  const [requiresGenset, setRequiresGenset] = useState(false)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Ответ ставкой (перевозчик)
  const [offerTo, setOfferTo] = useState<RateRequest | null>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerVat, setOfferVat] = useState<VatType>('none')
  const [offerComment, setOfferComment] = useState('')
  const [offering, setOffering] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const supabase = createClient()
    // RLS сама решает, что видно: клиенту — свои запросы в любом статусе,
    // перевозчику — только открытые и только не спрятанные от него.
    let query = supabase
      .from('rate_requests')
      .select('*, client:users!client_id(id, name, company_name, city, is_verified, logo_url)')
      .order('created_at', { ascending: false })
    if (user.role === 'client') query = query.eq('client_id', user.id)
    else query = query.eq('status', 'open')

    const { data } = await query
    const list = (data || []) as RateRequest[]
    setRequests(list)

    if (list.length > 0) {
      // Перевозчику RLS вернёт здесь только его собственные ставки — чужие он
      // не видит и подстроиться под них не может.
      const { data: offerRows } = await supabase
        .from('rate_request_offers')
        .select('*, carrier:users!carrier_id(id, name, company_name, city, is_verified, logo_url)')
        .in('request_id', list.map(r => r.id))
        .order('amount', { ascending: true })
      const byRequest: Record<string, RateRequestOffer[]> = {}
      for (const o of (offerRows || []) as RateRequestOffer[]) {
        (byRequest[o.request_id] ??= []).push(o)
      }
      setOffers(byRequest)
    } else {
      setOffers({})
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (userLoading) return
    if (!user) { setLoading(false); return }
    fetchAll()
  }, [user, userLoading, fetchAll])

  function resetForm() {
    setFromCity(''); setFromAddress(''); setViaCity(''); setToCity(''); setToAddress('')
    setContainerType('40HC'); setWeightGross(''); setRequiresGenset(false); setComment('')
    setErrors({})
  }

  async function createRequest() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = 'Укажите город отправления'
    if (!toCity) e.toCity = 'Укажите город назначения'
    if (Object.keys(e).length > 0) { setErrors(e); return }
    if (!user) return
    if (!isEmailVerified) { toast.error('Подтвердите почту чтобы публиковать запросы'); return }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('rate_requests').insert({
      client_id: user.id,
      from_city: fromCity,
      from_city_address: fromAddress.trim() || null,
      via_city: viaCity.trim() || null,
      to_city: toCity,
      to_city_address: toAddress.trim() || null,
      container_type: containerType,
      weight_gross: weightGross ? parseInt(weightGross) : null,
      requires_genset: requiresGenset,
      comment: comment.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error('Не удалось опубликовать запрос'); return }
    toast.success('Запрос опубликован')
    setCreateOpen(false)
    resetForm()
    fetchAll()
  }

  async function sendOffer() {
    if (!offerTo || !user) return
    const amount = parseInt(offerAmount)
    if (!amount || amount <= 0) { toast.error('Введите сумму'); return }
    if (!isEmailVerified) { toast.error('Подтвердите почту чтобы предлагать ставку'); return }

    setOffering(true)
    const supabase = createClient()
    const { error } = await supabase.from('rate_request_offers').upsert({
      request_id: offerTo.id,
      carrier_id: user.id,
      amount,
      vat_type: offerVat,
      comment: offerComment.trim() || null,
    }, { onConflict: 'request_id,carrier_id' })
    setOffering(false)
    if (error) { toast.error('Не удалось отправить ставку'); return }
    toast.success('Ставка отправлена')
    setOfferTo(null)
    setOfferAmount(''); setOfferComment(''); setOfferVat('none')
    fetchAll()
  }

  async function closeRequest(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('rate_requests')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error('Не удалось закрыть запрос'); return }
    toast.success('Запрос закрыт')
    fetchAll()
  }

  async function reopenRequest(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('rate_requests')
      .update({ status: 'open', closed_at: null })
      .eq('id', id)
    if (error) { toast.error('Не удалось переоткрыть запрос'); return }
    fetchAll()
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isRef = REF_CONTAINER_TYPES.has(containerType)

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Запросы ставки</h1>
            <p className="text-[13px] text-ink-3 mt-0.5">
              {isClient
                ? 'Узнать цену, пока груза ещё нет — контейнер в пути, дата не определилась'
                : 'Клиенты спрашивают цену по маршруту. Ответьте ставкой — рейса пока нет'}
            </p>
          </div>
          {isClient && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} className="mr-1" /> Запросить ставку
            </Button>
          )}
        </div>

        {loading ? (
          <div className="border border-hairline rounded-card bg-surface overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 h-[64px] px-5 border-b border-hairline last:border-0">
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6">
            <ContainerMark size={28} className="text-ink-4" />
            <span className="text-[15px] text-ink-3 max-w-[380px]">
              {isClient
                ? 'Запросов пока нет. Опишите маршрут и контейнер — перевозчики назовут цену, ничего не публикуя в ленту.'
                : 'Открытых запросов нет. Здесь появятся маршруты, по которым клиенты хотят узнать цену.'}
            </span>
            {isClient && (
              <Button onClick={() => setCreateOpen(true)}>Запросить ставку</Button>
            )}
          </div>
        ) : (
          <div className="border border-hairline rounded-card bg-surface overflow-hidden">
            {requests.map(r => {
              const list = offers[r.id] ?? []
              const myOffer = !isClient ? list.find(o => o.carrier_id === user?.id) : undefined
              const open = expanded.has(r.id)
              const label = CONTAINER_TYPES.find(c => c.value === r.container_type)?.label || r.container_type
              return (
                <div key={r.id} className="border-b border-hairline last:border-0">
                  <div className="flex items-start gap-3.5 py-3 px-5">
                    <span className="w-[76px] flex-none font-mono text-[13px] text-ink-3 pt-0.5">
                      {r.number ?? '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <RouteInline from={r.from_city} to={r.to_city} via={r.via_city} />
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        <ContainerChip label={label} genset={r.requires_genset} />
                        {r.weight_gross != null && (
                          <span className="font-mono text-[12px] tabular-nums text-ink-3">
                            {r.weight_gross.toLocaleString('ru-RU')} кг
                          </span>
                        )}
                        {r.status === 'closed' && (
                          <span className="px-2 py-0.5 rounded-field bg-surface-sunken text-ink-3 text-[11.5px] font-medium">
                            закрыт
                          </span>
                        )}
                        {!isClient && r.client && (
                          <span className="text-xs text-ink-3 inline-flex items-center gap-1.5">
                            <CompanyAvatar src={r.client.logo_url} size={20} />
                            {r.client.company_name || r.client.name}
                            <VerifiedBadge verified={r.client.is_verified} iconOnly />
                          </span>
                        )}
                      </div>
                      {r.comment && (
                        <p className="text-[13px] text-ink-2 mt-1.5 whitespace-pre-line">{r.comment}</p>
                      )}
                      <div className="font-mono text-[11.5px] tabular-nums text-ink-4 mt-1.5">
                        {formatDateTime(r.created_at)}
                      </div>
                    </div>

                    <div className="flex-none flex flex-col items-end gap-2">
                      {isClient ? (
                        <>
                          <button
                            onClick={() => toggle(r.id)}
                            className="font-mono text-[13px] tabular-nums text-accent hover:text-accent-hover transition-colors"
                          >
                            ставок: {list.length}
                          </button>
                          {r.status === 'open' ? (
                            <button
                              onClick={() => closeRequest(r.id)}
                              className="text-[12px] font-medium text-ink-3 hover:text-ink transition-colors"
                            >
                              закрыть
                            </button>
                          ) : (
                            <button
                              onClick={() => reopenRequest(r.id)}
                              className="text-[12px] font-medium text-accent hover:text-accent-hover transition-colors"
                            >
                              переоткрыть
                            </button>
                          )}
                        </>
                      ) : myOffer ? (
                        <>
                          <span className="font-mono text-[15px] font-medium tabular-nums text-success whitespace-nowrap">
                            {money(myOffer.amount)}
                          </span>
                          <button
                            onClick={() => {
                              setOfferTo(r)
                              setOfferAmount(String(myOffer.amount))
                              setOfferVat(myOffer.vat_type)
                              setOfferComment(myOffer.comment ?? '')
                            }}
                            className="text-[12px] font-medium text-accent hover:text-accent-hover transition-colors"
                          >
                            изменить
                          </button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setOfferTo(r)
                            setOfferAmount(''); setOfferVat('none'); setOfferComment('')
                          }}
                        >
                          Предложить
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Собранные ставки — только автору запроса */}
                  {isClient && open && (
                    <div className="bg-surface-sunken border-t border-hairline">
                      {list.length === 0 ? (
                        <p className="px-5 py-3 text-[13px] text-ink-3">Пока никто не назвал цену.</p>
                      ) : (
                        list.map(o => (
                          <div key={o.id} className="flex items-start gap-3 px-5 py-2.5 border-b border-hairline last:border-0">
                            <CompanyAvatar src={o.carrier?.logo_url} size={26} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-sm text-ink">
                                {o.carrier?.company_name || o.carrier?.name || 'Перевозчик'}
                                <VerifiedBadge verified={!!o.carrier?.is_verified} iconOnly />
                              </div>
                              {o.comment && <p className="text-[13px] text-ink-2 mt-0.5">{o.comment}</p>}
                              <div className="font-mono text-[11.5px] tabular-nums text-ink-4 mt-0.5">
                                {formatDateTime(o.created_at)}
                              </div>
                            </div>
                            <div className="flex-none text-right">
                              <div className="font-mono text-[15px] font-medium tabular-nums text-ink">{money(o.amount)}</div>
                              <div className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-ink-4">
                                {vatLabel(o.vat_type)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {isClient && requests.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-4">
            Запрос не превращается в заявку сам: к моменту, когда груз появится, цифры обычно
            расходятся. Договоритесь с перевозчиком и заведите рейс обычной заявкой.
          </p>
        )}
      </div>

      {/* Создание запроса */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Запросить ставку">
        <div className="space-y-3">
          <div className="space-y-2">
            <CityAutocomplete
              id="rrFrom"
              label="Откуда"
              value={fromCity}
              onChange={v => { setFromCity(v); setErrors(p => ({ ...p, fromCity: '' })) }}
              placeholder="Город отправления"
              error={errors.fromCity}
            />
            <Input
              label="Точный адрес (необязательно)"
              value={fromAddress}
              onChange={e => setFromAddress(e.target.value)}
              placeholder="Улица, номер склада..."
            />
          </div>
          <CityAutocomplete
            id="rrVia"
            label="Промежуточная точка (необязательно)"
            value={viaCity}
            onChange={setViaCity}
            placeholder="Город"
          />
          <div className="space-y-2">
            <CityAutocomplete
              id="rrTo"
              label="Куда"
              value={toCity}
              onChange={v => { setToCity(v); setErrors(p => ({ ...p, toCity: '' })) }}
              placeholder="Город назначения"
              error={errors.toCity}
            />
            <Input
              label="Точный адрес (необязательно)"
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
              placeholder="Улица, номер склада..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              id="rrContainer"
              label="Тип контейнера"
              value={containerType}
              onChange={e => {
                const v = e.target.value as ContainerType
                setContainerType(v)
                if (!REF_CONTAINER_TYPES.has(v)) setRequiresGenset(false)
              }}
              options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
            />
            <Input
              id="rrWeight"
              type="number"
              label="Вес брутто, кг"
              value={weightGross}
              onChange={e => setWeightGross(e.target.value)}
              placeholder="кг"
              min="0"
              className="font-mono tabular-nums"
            />
          </div>

          {isRef && (
            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-field border border-warning/30 bg-warning-soft">
              <input
                type="checkbox"
                checked={requiresGenset}
                onChange={e => setRequiresGenset(e.target.checked)}
                className="w-4 h-4 rounded border-hairline accent-accent"
              />
              <span className="text-sm text-warning font-medium">Нужен Genset</span>
            </label>
          )}

          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Комментарий
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Готов будет через неделю, пока контейнер в пути..."
              className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 leading-relaxed resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
            <p className="text-xs text-ink-4 mt-1">
              Даты у запроса нет — когда груз будет готов, напишите здесь.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Button className="flex-1" loading={saving} onClick={createRequest}>Опубликовать запрос</Button>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Отмена</Button>
        </div>
      </Modal>

      {/* Ставка перевозчика */}
      <Modal open={!!offerTo} onClose={() => setOfferTo(null)} title="Предложить ставку">
        {offerTo && (
          <div>
            <div className="mb-4 flex flex-col gap-2 rounded-field border border-hairline bg-paper p-3.5">
              <span className="font-mono text-[12px] text-ink-3">{offerTo.number}</span>
              <RouteInline from={offerTo.from_city} to={offerTo.to_city} via={offerTo.via_city} />
            </div>

            {/* Честно предупреждаем: чужих ставок здесь не видно ни у кого,
                подстроиться под рынок не получится. */}
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-field bg-surface-sunken border border-hairline">
              <EyeOff size={15} className="text-ink-3 shrink-0 mt-0.5" />
              <p className="text-[13px] text-ink-2">
                Ставку вы предлагаете вслепую: чужие предложения по этому запросу не видны
                ни вам, ни другим перевозчикам. Их видит только клиент.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="offerAmount"
                type="number"
                label="Ваша ставка, ₽"
                value={offerAmount}
                onChange={e => setOfferAmount(e.target.value)}
                placeholder="например: 85000"
                min="1"
                className="font-mono tabular-nums"
              />
              <Select
                id="offerVat"
                label="НДС"
                value={offerVat}
                onChange={e => setOfferVat(e.target.value as VatType)}
                options={VAT_OPTIONS}
              />
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Комментарий (необязательно)
              </label>
              <textarea
                value={offerComment}
                onChange={e => setOfferComment(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Цена при подаче в течение недели..."
                className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 leading-relaxed resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <Button className="flex-1" loading={offering} onClick={sendOffer}>
                <Check size={16} className="mr-1" /> Отправить ставку
              </Button>
              <Button variant="secondary" onClick={() => setOfferTo(null)}>
                <X size={16} />
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}
