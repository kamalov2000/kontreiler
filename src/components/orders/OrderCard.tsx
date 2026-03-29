'use client'

import { ArrowRight, Clock, AlertCircle, MessageSquare, Timer, Zap, TrendingDown, TrendingUp } from 'lucide-react'
import { Order } from '@/types/database'
import { formatDate, formatPrice, formatDateTime } from '@/lib/utils'
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

function ExpiryCountdown({ expiresAt, t }: { expiresAt: string; t: { expiresIn: string; days: string; hours: string; minutes: string } }) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return null

  const totalMinutes = Math.floor(diff / 60000)
  const days    = Math.floor(totalMinutes / 1440)
  const hours   = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  let label = ''
  if (days > 0)       label = `${days}${t.days} ${hours}${t.hours}`
  else if (hours > 0) label = `${hours}${t.hours} ${minutes}${t.minutes}`
  else                label = `${minutes}${t.minutes}`

  const isUrgentExpiry = diff < 24 * 60 * 60 * 1000

  return (
    <span className={cn(
      'flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm',
      isUrgentExpiry
        ? 'bg-red-50 text-red-600 font-medium'
        : 'bg-amber-50 text-amber-700'
    )}>
      <Timer size={13} />
      {t.expiresIn} {label}
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
  const statusLabel = t.status[order.status as keyof typeof t.status] ?? order.status
  const isAuctionFormat = order.format === 'reduction' || order.format === 'auction'

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-shadow hover:shadow-md',
      order.format === 'urgent' ? 'border-red-200' : isAuctionFormat ? 'border-amber-200' : 'border-gray-100'
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
          <span className="text-xs text-gray-400">{formatDateTime(order.created_at)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.order_number && (
            <span className="text-sm font-bold font-mono text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
              {t.order.number} {order.order_number}
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

      {/* Маршрут: три точки А → Б → В */}
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
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm">
          {containerLabel}
        </span>
        {order.requires_genset && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">
            <Zap size={11} /> Genset
          </span>
        )}
        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
          {formatPrice(order.price, order.is_negotiable)}
        </span>
        <VatBadge vatType={order.vat_type} t={t.order} />
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm">
          <Clock size={13} />
          {formatDate(order.ready_date)}
        </span>
        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', ORDER_STATUS_CLASS[order.status])}>
          {statusLabel}
        </span>
        {order.expires_at && order.status === 'active' && (
          <ExpiryCountdown expiresAt={order.expires_at} t={t.order} />
        )}
      </div>

      {/* Вес */}
      {(order.weight_gross || order.weight_net) && (
        <div className="mb-3 flex gap-3 text-xs text-gray-500">
          {order.weight_gross && <span>Брутто: <strong className="text-gray-700">{order.weight_gross.toLocaleString('ru-RU')} кг</strong></span>}
          {order.weight_net   && <span>Нетто: <strong className="text-gray-700">{order.weight_net.toLocaleString('ru-RU')} кг</strong></span>}
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

      {/* Extra content (рейтинг клиента и т.п.) */}
      {extra && <div className="mb-3">{extra}</div>}

      {/* Действия */}
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
