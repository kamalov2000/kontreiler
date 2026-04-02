'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, AlertCircle, MessageSquare, Zap, TrendingDown, TrendingUp } from 'lucide-react'
import { Order } from '@/types/database'
import { formatDateWithTime, formatPrice, formatOrderNumber } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_CLASS } from '@/lib/status'
import { useLanguage } from '@/contexts/LanguageContext'

interface OrderCardProps {
  order: Order
  showResponses?: boolean
  actions?: React.ReactNode
  extra?: React.ReactNode
  bidData?: { best_amount: number | null; participant_count: number; bid_count: number } | null
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

function VatBadge({ vatType, t }: { vatType: string; t: { vatNone: string; vatVat20: string; vatVat0: string } }) {
  if (vatType === 'none') return null
  const label = vatType === 'vat20' ? t.vatVat20 : t.vatVat0
  return (
    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-xs">
      {label}
    </span>
  )
}

export function OrderCard({ order, showResponses, actions, extra, bidData }: OrderCardProps) {
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
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
            {formatPrice(order.price, order.is_negotiable)}
          </span>
        )}
        <VatBadge vatType={order.vat_type} t={t.order} />
        {/* Пункт 9: дата + время погрузки */}
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm">
          {formatDateWithTime(order.ready_date, order.ready_time)}
        </span>
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

      {/* Пункт 3: вес — показываем "Вес груза с контейнером: X кг" */}
      {(order.weight_gross || order.weight_net) && (
        <div className="mb-3 flex gap-3 text-xs text-gray-500">
          {order.weight_gross && (
            <span>Вес с контейнером: <strong className="text-gray-700">{order.weight_gross.toLocaleString('ru-RU')} кг</strong></span>
          )}
          {order.weight_net && (
            <span>Нетто: <strong className="text-gray-700">{order.weight_net.toLocaleString('ru-RU')} кг</strong></span>
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
