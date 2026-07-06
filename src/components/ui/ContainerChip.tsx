import { cn } from '@/lib/utils'

/** Тип контейнера как транспортная бирка — bordered-chip, mono caps.
 *  wrap=true разрешает перенос длинных меток на 2 строки (для плотных таблиц),
 *  иначе метка в одну строку (whitespace-nowrap). */
export function ContainerChip({
  label,
  genset,
  wrap = false,
  className = '',
}: {
  label: string
  genset?: boolean
  wrap?: boolean
  className?: string
}) {
  return (
    <span
      title={label}
      className={cn(
        'inline-block px-1.5 py-0.5 rounded-field border font-mono text-[11px] font-medium uppercase',
        wrap ? 'whitespace-normal leading-tight text-left' : 'whitespace-nowrap',
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
