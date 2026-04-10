'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, AlertCircle, MessageSquare, Zap, TrendingDown, TrendingUp } from 'lucide-react'
import { Order, OrderStop } from '@/types/database'
import { formatDateWithTime, formatPrice, formatOrderNumber, readyDateBadge } from '@/lib/utils'
import { CONTAINER_TYPES, CONTAINER_TARE_WEIGHT, CONTAINER_UNIT_TARE } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_CLASS } from '@/lib/status'
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
      'flex-1 flex items-center gap-1.5 text-sm font-mono',
      isUrgent ? 'text-red-600 font-semibold' : 'text-amber-700'
    )}>
      ⏱ Истекает через {label}
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
  const statusClass = ORDER_STATUS_CLASS[effectiveStatus] ?? ORDER_STATUS_CLASS.active

  // Таймер показываем только для активных заявок с ещё не истёкшим expires_at
  const showTimer = effectiveStatus === 'active' && !!order.expires_at

  // Пункт 11: для аукционов/редукционов не показываем статус "Новая"
  const showStatusBadge = !(isAuctionFormat && effectiveStatus === 'active')

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-shadow hover:shadow-md',
      order.format === 'urgent' ? 'border-red-200' : isAuctionFormat ? 'border-amber-200' : 'border-gray-100',
      effectiveStatus === 'expired' ? 'border-orange-200 bg-orange-50/30' : ''
    )}>
      {/* Шапка */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {order.format === 'urgent' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
              <AlertCircle size={11} /> СРОЧНО
            </span>
          )}
          {order.format === 'reduction' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
              <TrendingDown size={11} /> {t.order.formatReduction}
            </span>
          )}
          {order.format === 'auction' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
              <TrendingUp size={11} /> {t.order.formatAuction}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(order.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.order_number && (
            <span className="text-sm font-bold font-mono text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
              {t.order.number} {formatOrderNumber(order.order_number)}
            </span>
          )}
          {showResponses !== undefined && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <MessageSquare size={14} />
              {order.response_count || 0}
            </span>
          )}
        </div>
      </div>

      {/* Дополнительные точки (над маршрутом) */}
      {stops && stops.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1">
          {stops.map((s, i) => (
            <div key={s.id} className="flex items-start gap-1.5 text-xs text-gray-500">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">{i + 1}</span>
              <span className="font-medium text-gray-700">{s.address}</span>
              {s.comment && <span className="text-gray-400">— {s.comment}</span>}
            </div>
          ))}
        </div>
      ) : hasStops ? (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
            📍 Есть доп. точки маршрута
          </span>
        </div>
      ) : null}

      {/* Маршрут */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="font-semibold text-gray-900 text-base sm:text-lg">{order.from_city}</span>
        <ArrowRight size={14} className="text-gray-400 shrink-0" />
        {order.via_city && (
          <>
            <span className="font-semibold text-gray-900 text-base sm:text-lg">{order.via_city}</span>
            <ArrowRight size={14} className="text-gray-400 shrink-0" />
          </>
        )}
        <span className="font-semibold text-gray-900 text-base sm:text-lg">{order.to_city}</span>
      </div>

      {/* Детали */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm">
          {containerLabel}
        </span>
        {order.requires_genset && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">
            <Zap size={11} /> Genset
          </span>
        )}
        {/* Пункт 10: для аукционов/редукционов — Начальная ставка, иначе обычная цена */}
        {isAuctionFormat ? (
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-sm font-medium">
            Начальная ставка: {order.auction_start_price?.toLocaleString('ru-RU')} ₽
          </span>
        ) : (
          <span className="flex flex-col px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
            <span>{formatPrice(order.price, order.is_negotiable)}</span>
            <span className="text-xs text-blue-500 font-normal">{vatInlineLabel(order.vat_type)}</span>
          </span>
        )}
        {/* Плановая дата погрузки/выгрузки с отсчётом дней */}
        {(() => {
          const badge = readyDateBadge(order.ready_date)
          const badgeColor = badge?.color === 'red' ? 'text-red-600' : badge?.color === 'amber' ? 'text-amber-600' : 'text-green-600'
          return (
            <span className="flex flex-col px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm">
              <span className="text-[10px] text-gray-400 leading-tight">Плановая дата</span>
              <span>{formatDateWithTime(order.ready_date, order.ready_time)}</span>
              {badge && <span className={`text-xs font-medium leading-tight ${badgeColor}`}>{badge.label}</span>}
            </span>
          )
        })()}
      </div>

      {/* Пункты 6 + 8: статус + таймер в одной строке */}
      <div className="flex items-center gap-2 mb-3">
        {showStatusBadge && (
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium shrink-0', statusClass)}>
            {/* Пункт 1: жирный красный текст для просроченных */}
            {effectiveStatus === 'expired'
              ? <strong className="text-red-700 font-black">ПРОСРОЧЕНА</strong>
              : statusLabel
            }
          </span>
        )}
        {showTimer && order.expires_at && (
          <ExpiryCountdown expiresAt={order.expires_at} />
        )}
      </div>

      {/* Вес груза с контейнером */}
      {(order.weight_gross || order.weight_net || order.weight_gross_2 || order.weight_net_2) && (
        <div className="mb-3 flex flex-col gap-1 text-xs text-gray-500">
          {order.container_type === '20DC2' ? (
            <>
              {order.weight_gross && (
                <span>Конт. 1 с тарой: <strong className="text-gray-700">{(order.weight_gross + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong>
                  {order.weight_net && <> · нетто: <strong>{order.weight_net.toLocaleString('ru-RU')} кг</strong></>}</span>
              )}
              {order.weight_gross_2 && (
                <span>Конт. 2 с тарой: <strong className="text-gray-700">{(order.weight_gross_2 + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong>
                  {order.weight_net_2 && <> · нетто: <strong>{order.weight_net_2.toLocaleString('ru-RU')} кг</strong></>}</span>
              )}
            </>
          ) : (
            <div className="flex gap-3">
              {order.weight_gross && (
                <span>Вес груза с контейнером: <strong className="text-gray-700">{(order.weight_gross + (CONTAINER_TARE_WEIGHT[order.container_type] ?? 0)).toLocaleString('ru-RU')} кг</strong></span>
              )}
              {order.weight_net && (
                <span>Нетто: <strong className="text-gray-700">{order.weight_net.toLocaleString('ru-RU')} кг</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Особые условия */}
      {order.notes && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
          ⚠️ {order.notes}
        </div>
      )}

      {/* Данные торгов */}
      {isAuctionFormat && bidData !== undefined && (
        <div className="mb-3 flex flex-wrap gap-3 text-sm px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
          <span className="text-gray-600">
            {t.auctions.bestBid}:{' '}
            <strong className="text-gray-900">
              {bidData?.best_amount ? `${bidData.best_amount.toLocaleString('ru-RU')} ₽` : `${order.auction_start_price?.toLocaleString('ru-RU')} ₽ (старт)`}
            </strong>
          </span>
          {bidData && (
            <span className="text-gray-500">
              {bidData.participant_count} {t.auctions.participants} · {bidData.bid_count} {t.auctions.bidCount}
            </span>
          )}
        </div>
      )}

      {extra && <div className="mb-3">{extra}</div>}

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
