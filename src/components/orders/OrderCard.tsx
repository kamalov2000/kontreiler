import { ArrowRight, Clock, AlertCircle, MessageSquare } from 'lucide-react'
import { Order } from '@/types/database'
import { formatDate, formatPrice, formatDateTime } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_LABEL, ORDER_STATUS_CLASS } from '@/lib/status'

interface OrderCardProps {
  order: Order
  showResponses?: boolean
  actions?: React.ReactNode
  extra?: React.ReactNode
}

export function OrderCard({ order, showResponses, actions, extra }: OrderCardProps) {
  const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label || order.container_type

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-shadow hover:shadow-md',
      order.is_urgent ? 'border-red-200' : 'border-gray-100'
    )}>
      {/* Шапка */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {order.is_urgent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
              <AlertCircle size={11} /> СРОЧНО
            </span>
          )}
          <span className="text-xs text-gray-400">{formatDateTime(order.created_at)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.order_number && (
            <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
              {order.order_number}
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
      <div className="flex items-center gap-2 mb-3">
        <span className="font-semibold text-gray-900 text-base sm:text-lg">{order.from_city}</span>
        <ArrowRight size={16} className="text-gray-400 shrink-0" />
        <span className="font-semibold text-gray-900 text-base sm:text-lg">{order.to_city}</span>
      </div>

      {/* Детали */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm">
          {containerLabel}
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
          {formatPrice(order.price, order.is_negotiable)}
        </span>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm">
          <Clock size={13} />
          {formatDate(order.ready_date)}
        </span>
        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', ORDER_STATUS_CLASS[order.status])}>
          {ORDER_STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      {/* Особые условия */}
      {order.notes && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
          ⚠️ {order.notes}
        </div>
      )}

      {/* Extra content (рейтинг клиента и т.п.) */}
      {extra && <div className="mb-3">{extra}</div>}

      {/* Действия */}
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
