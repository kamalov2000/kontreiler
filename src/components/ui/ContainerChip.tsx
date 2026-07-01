import { cn } from '@/lib/utils'

/** Тип контейнера как транспортная бирка — bordered-chip, mono caps. */
export function ContainerChip({
  label,
  genset,
  className = '',
}: {
  label: string
  genset?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded-field border font-mono text-[11px] font-medium uppercase whitespace-nowrap',
        genset
          ? 'border-warning bg-warning-soft text-warning'
          : 'border-hairline bg-surface-sunken text-ink-2',
        className
      )}
    >
      {label}
    </span>
  )
}
