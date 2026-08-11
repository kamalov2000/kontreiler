'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, CircleAlert, Lock } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { Order, OrderExtraServices, effectiveDowntimeRate } from '@/types/database'

/**
 * Простой и перегруз по завершённому рейсу.
 *
 * Сумма после подписания не меняется — растёт только за счёт этих услуг,
 * поэтому они вносятся вручную после рейса. Отсюда данные уходят в реестр
 * перевозок отдельными колонками и в итоговую ставку.
 *
 * Простой — предмет согласования, и порядок у него двусторонний: часы заявляет
 * перевозчик, подтверждает или оспаривает заказчик. Оспорил — поле снова
 * редактируемо перевозчиком. Пока не подтверждено, простой в реестр всё равно
 * идёт, но помечается несогласованным. Разделение ролей продублировано
 * триггером в БД (guard_downtime_confirmation): в вопросе денег на UI полагаться
 * нельзя.
 *
 * Перегруз спорным не бывает — он подтверждён весовой — и правится обеими
 * сторонами без согласования.
 */
export function ExtraServicesBlock({
  order,
  extras,
  viewerRole,
  onSaved,
}: {
  order: Order
  extras: OrderExtraServices | null
  /** Кем пользователь приходится этой заявке — от этого зависит, что он правит. */
  viewerRole: 'client' | 'carrier'
  onSaved: (e: OrderExtraServices) => void
}) {
  const [downtimeRate, setDowntimeRate] = useState('')
  const [downtimeHours, setDowntimeHours] = useState('')
  const [overweightRate, setOverweightRate] = useState('')
  const [overweightTons, setOverweightTons] = useState('')
  const [saving, setSaving] = useState(false)
  const [deciding, setDeciding] = useState(false)

  useEffect(() => {
    // Ставку подставляем из заявки, если по услугам её ещё не согласовали
    setDowntimeRate(String(effectiveDowntimeRate(extras, order) ?? ''))
    setDowntimeHours(extras?.downtime_hours != null ? String(extras.downtime_hours) : '')
    setOverweightRate(extras?.overweight_rate != null ? String(extras.overweight_rate) : '')
    setOverweightTons(extras?.overweight_tons != null ? String(extras.overweight_tons) : '')
  }, [extras, order])

  const isCarrier = viewerRole === 'carrier'
  const confirmed = !!extras?.downtime_confirmed
  const claimed = extras?.downtime_hours != null
  // Перевозчик правит простой, пока заказчик его не подтвердил
  const canEditDowntime = isCarrier && !confirmed

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  const dRate = num(downtimeRate)
  const dHours = num(downtimeHours)
  const oRate = num(overweightRate)
  const oTons = num(overweightTons)

  const downtimeSum = dRate != null && dHours != null ? dRate * dHours : null
  const overweightSum = oRate != null && oTons != null ? oRate * oTons : null

  async function handleSave() {
    const touched = isCarrier ? [dRate, dHours, oRate, oTons] : [oRate, oTons]
    for (const v of touched) {
      if (v != null && (isNaN(v) || v < 0)) {
        toast.error('Значения не могут быть отрицательными')
        return
      }
    }
    setSaving(true)
    const supabase = createClient()
    // Заказчик шлёт только перегруз: часы простоя ему править нечем, а лишние
    // колонки в payload снимут подтверждение (триггер сбрасывает флаг на любой
    // правке цифр — даже если значение то же самое, оно попадёт в UPDATE).
    const payload = {
      order_id: order.id,
      overweight_rate: oRate,
      overweight_tons: oTons,
      ...(canEditDowntime ? { downtime_rate: dRate, downtime_hours: dHours } : {}),
    }
    const { data, error } = await supabase
      .from('order_extra_services')
      .upsert(payload, { onConflict: 'order_id' })
      .select()
      .single()

    setSaving(false)
    if (error) {
      toast.error('Не удалось сохранить дополнительные услуги')
      return
    }
    toast.success(
      canEditDowntime && dHours != null && !confirmed
        ? 'Сохранено. Простой отправлен заказчику на подтверждение'
        : 'Дополнительные услуги сохранены'
    )
    onSaved(data as OrderExtraServices)
  }

  // Подтверждение и снятие подтверждения — только заказчик (и в БД тоже).
  async function decideDowntime(next: boolean) {
    setDeciding(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('order_extra_services')
      .update({ downtime_confirmed: next })
      .eq('order_id', order.id)
      .select()
      .single()

    setDeciding(false)
    if (error) {
      toast.error(next ? 'Не удалось подтвердить простой' : 'Не удалось оспорить простой')
      return
    }
    toast.success(next
      ? 'Простой подтверждён'
      : 'Простой оспорен — перевозчик сможет исправить часы')
    onSaved(data as OrderExtraServices)
  }

  const money = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="bg-surface border border-hairline rounded-card p-5 mb-6">
      <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-2 mb-1">
        Дополнительные услуги
      </div>
      <p className="text-[13px] text-ink-3 mb-4">
        Простой и перегруз согласовываются сторонами после рейса; попадут в реестр перевозок
        и в итоговую ставку. Часы простоя заявляет перевозчик, подтверждает заказчик.
        Поля необязательные.
      </p>

      <div className="space-y-3">
        {/* ── Простой ─────────────────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            id="downtimeRate"
            type="number"
            label="Ставка простоя, ₽/час"
            value={downtimeRate}
            onChange={e => setDowntimeRate(e.target.value)}
            placeholder="например: 500"
            min="0"
            disabled={!canEditDowntime}
            className="font-mono tabular-nums"
          />
          <Input
            id="downtimeHours"
            type="number"
            label="Часов простоя"
            value={downtimeHours}
            onChange={e => setDowntimeHours(e.target.value)}
            placeholder="например: 4"
            min="0"
            step="0.5"
            disabled={!canEditDowntime}
            className="font-mono tabular-nums"
          />
        </div>
        {downtimeSum != null && (
          <div className="text-[13px] text-ink-3">
            Стоимость простоя: <strong className="font-mono tabular-nums text-ink">{money(downtimeSum)} ₽</strong>
          </div>
        )}

        {/* Состояние согласования: видно обеим сторонам, кнопки — только заказчику */}
        {claimed && (
          <div className={`flex items-start gap-2.5 flex-wrap px-3 py-2.5 rounded-field border text-[13px] ${
            confirmed
              ? 'border-hairline bg-surface-sunken text-ink-2'
              : 'border-amber-300/60 bg-amber-50 text-amber-800'
          }`}>
            {confirmed
              ? <Check size={15} className="mt-0.5 shrink-0" />
              : <CircleAlert size={15} className="mt-0.5 shrink-0" />}
            <span className="flex-1 min-w-[12rem]">
              {confirmed
                ? `Простой согласован заказчиком${extras?.downtime_confirmed_at
                    ? ' ' + new Date(extras.downtime_confirmed_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : ''}`
                : isCarrier
                ? 'Ожидает подтверждения заказчика. В реестре пойдёт с пометкой «не согласовано»'
                : 'Перевозчик заявил простой. Подтвердите его или оспорьте — тогда перевозчик сможет исправить часы'}
            </span>
            {!isCarrier && (
              <Button
                size="sm"
                variant={confirmed ? 'secondary' : 'primary'}
                loading={deciding}
                onClick={() => decideDowntime(!confirmed)}
              >
                {confirmed ? 'Оспорить' : 'Подтвердить'}
              </Button>
            )}
          </div>
        )}
        {isCarrier && confirmed && (
          <p className="flex items-center gap-1.5 text-[12px] text-ink-4">
            <Lock size={12} /> Пока заказчик не снял подтверждение, часы простоя не редактируются
          </p>
        )}
        {!isCarrier && !claimed && (
          <p className="text-[12px] text-ink-4">Перевозчик простой пока не заявил.</p>
        )}

        {/* ── Перегруз ────────────────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          <Input
            id="overweightRate"
            type="number"
            label="Ставка за сверхнормативную тонну, ₽"
            value={overweightRate}
            onChange={e => setOverweightRate(e.target.value)}
            placeholder="например: 1500"
            min="0"
            className="font-mono tabular-nums"
          />
          <Input
            id="overweightTons"
            type="number"
            label="Сверхнормативных тонн"
            value={overweightTons}
            onChange={e => setOverweightTons(e.target.value)}
            placeholder="например: 2"
            min="0"
            step="0.1"
            className="font-mono tabular-nums"
          />
        </div>
        {overweightSum != null && (
          <div className="text-[13px] text-ink-3">
            Стоимость перегруза: <strong className="font-mono tabular-nums text-ink">{money(overweightSum)} ₽</strong>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={handleSave} loading={saving}>Сохранить</Button>
        {extras?.updated_at && (
          <span className="text-[12px] text-ink-4 font-mono tabular-nums">
            обновлено {new Date(extras.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
