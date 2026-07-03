'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, MessageSquare, TrendingDown, TrendingUp, Truck, PauseCircle, Satellite, MapPin, Timer } from 'lucide-react'
import { Order, OrderStop } from '@/types/database'
import { formatDateWithTime, formatPrice, formatOrderNumber, readyDateBadge } from '@/lib/utils'
import { CONTAINER_TYPES, CONTAINER_TARE_WEIGHT, CONTAINER_UNIT_TARE } from '@/lib/cities'
import { TRACKING_STEPS, getTrackingStepIndex } from '@/lib/tracking'
import { cn } from '@/lib/utils'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { StatusPill } from '@/components/ui/StatusPill'
import { useLanguage } from '@/contexts/LanguageContext'

interface OrderCardProps {
  order: Order
  showResponses?: boolean
  actions?: React.ReactNode
  extra?: React.ReactNode
  bidData?: { best_amount: number | null; participant_count: number; bid_count: number } | null
  stops?: OrderStop[]
  hasStops?: boolean
}

// Обратный отсчёт с секундами (пункты 6, 7, 8)
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const diff = new Date(expiresAt).getTime() - now
  if (diff <= 0) return null

  const totalSeconds = Math.floor(diff / 1000)
  const days    = Math.floor(totalSeconds / 86400)
  const hours   = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  let label: string
  if (days > 0) {
    label = `${days}д ${hours}ч ${minutes}мин ${seconds}сек`
  } else {
    label = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const isUrgent = diff < 24 * 60 * 60 * 1000

  return (
    <span className={cn(
      'flex-1 flex items-center gap-1.5 text-sm font-mono tabular-nums',
      isUrgent ? 'text-danger font-semibold' : 'text-warning'
    )}>
      <Timer size={13} className="shrink-0" /> Истекает через {label}
    </span>
  )
}

function vatInlineLabel(vatType: string): string {
  if (vatType === 'vat20') return 'с НДС 22%'
  if (vatType === 'vat15') return 'с НДС 15%'
  if (vatType === 'vat5')  return 'с НДС 5%'
  if (vatType === 'vat0')  return 'НДС 0%'
  return 'Без НДС'
}

export function OrderCard({ order, showResponses, actions, extra, bidData, stops, hasStops }: OrderCardProps) {
  const { t } = useLanguage()
  const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label || order.container_type
  const isAuctionFormat = order.format === 'reduction' || order.format === 'auction'

  // Пункт 8: если expires_at прошёл — показываем как просроченную даже если статус active
  const now = Date.now()
  const effectiveStatus = (
    order.status === 'active' &&
    order.expires_at &&
    new Date(order.expires_at).getTime() <= now
  ) ? 'expired' : order.status

  const statusLabel = t.status[effectiveStatus as keyof typeof t.status] ?? effectiveStatus

  // Таймер показываем только для активных заявок с ещё не истёкшим expires_at
  const showTimer = effectiveStatus === 'active' && !!order.expires_at

  // Пункт 11: для аукционов/редукционов не показываем статус "Новая"
  const showStatusBadge = !(isAuctionFormat && effectiveStatus === 'active')

  return (
    <div className={cn(
      'bg-surface rounded-card border p-4 sm:p-5 transition-colors ease-terminal',
      order.format === 'urgent' ? 'border-danger/40' : isAuctionFormat ? 'border-warning/40' : 'border-hairline',
      effectiveStatus === 'expired' ? 'border-danger/40 bg-danger-soft/30' : ''
    )}>
      {/* Шапка */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {order.format === 'urgent' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-danger-soft text-danger text-[11px] font-semibold tracking-[0.06em] uppercase">
              <AlertCircle size={11} /> СРОЧНО
            </span>
          )}
          {order.format === 'reduction' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-warning-soft text-warning text-[11px] font-semibold tracking-[0.06em] uppercase">
              <TrendingDown size={11} /> {t.order.formatReduction}
            </span>
          )}
          {order.format === 'auction' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-accent-soft text-accent text-[11px] font-semibold tracking-[0.06em] uppercase">
              <TrendingUp size={11} /> {t.order.formatAuction}
            </span>
          )}
          <span className="font-mono text-[12px] tabular-nums text-ink-4">
            {new Date(order.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.order_number && (
            <span className="text-sm font-medium font-mono tabular-nums text-accent bg-accent-soft px-2.5 py-1 rounded-field border border-hairline">
              {t.order.number} {formatOrderNumber(order.order_number)}
            </span>
          )}
          {showResponses !== undefined && (
            <span className="flex items-center gap-1 text-sm text-ink-3">
              <MessageSquare size={14} />
              <span className="font-mono tabular-nums">{order.response_count || 0}</span>
            </span>
          )}
        </div>
      </div>

      {/* Дополнительные точки (над маршрутом) */}
      {stops && stops.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1">
          {stops.map((s, i) => (
            <div key={s.id} className="flex items-start gap-1.5 text-xs text-ink-3">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-warning-soft text-warning flex items-center justify-center font-mono text-[10px] font-medium shrink-0">{i + 1}</span>
              <span className="font-medium text-ink-2">{s.address}</span>
              {s.comment && <span className="text-ink-4">— {s.comment}</span>}
            </div>
          ))}
        </div>
      ) : hasStops ? (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-xs text-warning bg-warning-soft px-2 py-0.5 rounded-field border border-hairline">
            <MapPin size={11} /> Есть доп. точки маршрута
          </span>
        </div>
      ) : null}

      {/* Маршрут */}
      <div className="mb-3">
        <RouteInline
          from={order.from_city}
          to={order.to_city}
          via={order.via_city}
          className="text-base"
        />
      </div>

      {/* Детали */}
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <ContainerChip label={containerLabel} className="mt-0.5" />
        {order.requires_genset && (
          <ContainerChip label="Genset" genset className="mt-0.5" />
        )}
        {/* Пункт 10: для аукционов/редукционов — Начальная ставка, иначе обычная цена */}
        {isAuctionFormat ? (
          <span className="px-2.5 py-1 rounded-field bg-warning-soft text-warning text-sm font-medium">
            Начальная ставка: <span className="font-mono tabular-nums">{order.auction_start_price?.toLocaleString('ru-RU')} ₽</span>
          </span>
        ) : (
          <span className="flex flex-col px-2.5 py-1 rounded-field bg-accent-soft text-accent">
            <span className="font-mono text-sm font-medium tabular-nums">{formatPrice(order.price, order.is_negotiable)}</span>
            <span className="text-[11px] text-accent/70 font-normal">{vatInlineLabel(order.vat_type)}</span>
          </span>
        )}
        {/* Плановая дата погрузки/выгрузки с отсчётом дней */}
        {(() => {
          const badge = readyDateBadge(order.ready_date)
          const badgeColor = badge?.color === 'red' ? 'text-danger' : badge?.color === 'amber' ? 'text-warning' : 'text-success'
          return (
            <span className="flex flex-col px-2.5 py-1 rounded-field bg-surface-sunken text-ink-2">
              <span className="text-[10px] uppercase tracking-[0.06em] text-ink-4 leading-tight">Плановая дата</span>
              <span className="font-mono text-sm tabular-nums">{formatDateWithTime(order.ready_date, order.ready_time)}</span>
              {badge && <span className={`text-xs font-medium leading-tight ${badgeColor}`}>{badge.label}</span>}
            </span>
          )
        })()}
      </div>

      {/* Статус + таймер + трекинг в одной строке */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {showStatusBadge && (
          effectiveStatus === 'expired'
            ? <StatusPill status="expired" kind="order" label="Просрочена" className="shrink-0" />
            : <StatusPill status={effectiveStatus} kind="order" label={statusLabel} className="shrink-0" />
        )}
        {showTimer && order.expires_at && (
          <ExpiryCountdown expiresAt={order.expires_at} />
        )}
        {/* Задача 10: статус рейса (трекинг) — заметно, «с первого взгляда» */}
        {order.tracking_enabled && order.tracking_status && (() => {
          const idx = getTrackingStepIndex(order.tracking_status)
          const step = TRACKING_STEPS[idx]
          return step ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-field bg-accent text-white text-xs font-semibold">
              <Truck size={13} /> Рейс: {step.shortLabel}
            </span>
          ) : null
        })()}
        {order.tracking_enabled && !order.tracking_status && ['matched', 'in_transit'].includes(order.status) && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-field bg-surface-sunken text-ink-3 text-xs font-semibold border border-hairline">
            <PauseCircle size={13} /> Рейс не в пути
          </span>
        )}
        {/* Предупреждение об онлайн трекинге для перевозчика (видно в ленте ещё до принятия) */}
        {order.tracking_enabled && order.status === 'active' && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-field bg-warning-soft text-warning text-xs font-medium border border-hairline">
            <Satellite size={12} /> Требуется онлайн трекинг
          </span>
        )}
      </div>

      {/* Вес груза с контейнером */}
      {(order.weight_gross || order.weight_net || order.weight_gross_2 || order.weight_net_2) && (
        <div className="mb-3 flex flex-col gap-1 text-xs text-ink-3">
          {order.container_type === '20DC2' ? (
            <>
              {order.weight_gross && (
                <span>Конт. 1 с тарой: <strong className="font-mono tabular-nums text-ink-2">{(order.weight_gross + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong>
                  {order.weight_net && <> · нетто: <strong className="font-mono tabular-nums text-ink-2">{order.weight_net.toLocaleString('ru-RU')} кг</strong></>}</span>
              )}
              {order.weight_gross_2 && (
                <span>Конт. 2 с тарой: <strong className="font-mono tabular-nums text-ink-2">{(order.weight_gross_2 + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong>
                  {order.weight_net_2 && <> · нетто: <strong className="font-mono tabular-nums text-ink-2">{order.weight_net_2.toLocaleString('ru-RU')} кг</strong></>}</span>
              )}
            </>
          ) : (
            <div className="flex gap-3">
              {order.weight_gross && (
                <span>Вес груза с контейнером: <strong className="font-mono tabular-nums text-ink-2">{(order.weight_gross + (CONTAINER_TARE_WEIGHT[order.container_type] ?? 0)).toLocaleString('ru-RU')} кг</strong></span>
              )}
              {order.weight_net && (
                <span>Нетто: <strong className="font-mono tabular-nums text-ink-2">{order.weight_net.toLocaleString('ru-RU')} кг</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Особые условия */}
      {order.notes && (
        <div className="mb-3 flex items-start gap-1.5 px-3 py-2 rounded-field bg-warning-soft border border-hairline text-xs text-warning">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {order.notes}
        </div>
      )}

      {/* Данные торгов */}
      {isAuctionFormat && bidData !== undefined && (
        <div className="mb-3 flex flex-wrap gap-3 text-sm px-3 py-2 rounded-field bg-warning-soft border border-hairline">
          <span className="text-ink-2">
            {t.auctions.bestBid}:{' '}
            <strong className="font-mono tabular-nums text-ink">
              {bidData?.best_amount ? `${bidData.best_amount.toLocaleString('ru-RU')} ₽` : `${order.auction_start_price?.toLocaleString('ru-RU')} ₽ (старт)`}
            </strong>
          </span>
          {bidData && (
            <span className="text-ink-3">
              <span className="font-mono tabular-nums">{bidData.participant_count}</span> {t.auctions.participants} · <span className="font-mono tabular-nums">{bidData.bid_count}</span> {t.auctions.bidCount}
            </span>
          )}
        </div>
      )}

      {extra && <div className="mb-3">{extra}</div>}

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
