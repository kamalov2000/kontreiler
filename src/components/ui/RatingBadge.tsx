import { Star } from 'lucide-react'

interface RatingBadgeProps {
  avg: number
  count: number
  showLabel?: boolean
}

export function RatingBadge({ avg, count, showLabel = true }: RatingBadgeProps) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <Star size={11} className="fill-amber-400 text-amber-400 shrink-0" />
      <span className="font-medium">{avg}</span>
      {showLabel && <span className="text-gray-400">· {count} {count === 1 ? 'отзыв' : count < 5 ? 'отзыва' : 'отзывов'}</span>}
    </span>
  )
}
