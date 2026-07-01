import { cn } from '@/lib/utils'

type Tone = { label: string; pill: string; dot: string }

// Статусы заявки — мягкий фон + ведущая точка (Морской фрахт)
const ORDER_TONE: Record<string, Tone> = {
  active:     { label: 'Новая',      pill: 'bg-accent-soft text-accent',      dot: 'bg-accent' },
  matched:    { label: 'Назначена',  pill: 'bg-surface-sunken text-ink-2',    dot: 'bg-ink-3' },
  in_transit: { label: 'В пути',     pill: 'bg-warning-soft text-warning',    dot: 'bg-warning' },
  delivered:  { label: 'Доставлено', pill: 'bg-success-soft text-success',    dot: 'bg-success' },
  expired:    { label: 'Просрочена', pill: 'bg-danger-soft text-danger',      dot: 'bg-danger' },
  cancelled:  { label: 'Отменена',   pill: 'bg-danger-soft text-danger',      dot: 'bg-danger' },
  closed:     { label: 'Закрыта',    pill: 'bg-surface-sunken text-ink-3',    dot: 'bg-ink-4' },
}

// Статусы рейса (машины)
const TRUCK_TONE: Record<string, Tone> = {
  active: { label: 'Свободна',      pill: 'bg-accent-soft text-accent',   dot: 'bg-accent' },
  busy:   { label: 'Занята',        pill: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  done:   { label: 'Рейс выполнен', pill: 'bg-success-soft text-success', dot: 'bg-success' },
  closed: { label: 'Закрыта',       pill: 'bg-surface-sunken text-ink-3', dot: 'bg-ink-4' },
}

export function StatusPill({
  status,
  kind = 'order',
  label,
  className = '',
}: {
  status: string
  kind?: 'order' | 'truck'
  label?: string
  className?: string
}) {
  const map = kind === 'truck' ? TRUCK_TONE : ORDER_TONE
  const tone = map[status] ?? { label: status, pill: 'bg-surface-sunken text-ink-3', dot: 'bg-ink-4' }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-field text-[11.5px] font-semibold tracking-[0.06em] uppercase',
        tone.pill,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
      {label ?? tone.label}
    </span>
  )
}
