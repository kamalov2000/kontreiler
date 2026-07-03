import { Star } from 'lucide-react'

interface RatingBadgeProps {
  avg: number
  count: number
  showLabel?: boolean
}

export function RatingBadge({ avg, count, showLabel = true }: RatingBadgeProps) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <Star size={14} className="fill-warning text-warning shrink-0" />
        <span className="font-mono tabular-nums text-sm font-medium text-ink">{avg}</span>
      </span>
      {showLabel && (
        <span className="font-mono tabular-nums text-xs text-ink-4">
          ({count} {count === 1 ? 'отзыв' : count < 5 ? 'отзыва' : 'отзывов'})
        </span>
      )}
    </span>
  )
}
