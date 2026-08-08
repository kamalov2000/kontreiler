import { User, hasCarrierTerms } from '@/types/database'
import { CONTAINER_TYPES } from '@/lib/cities'
import { cn } from '@/lib/utils'

/**
 * Условия работы перевозчика — компактная сводка для клиента.
 * Живёт в карточке отклика и на странице машины, поэтому намеренно без
 * раскрытия и без заголовка на всю ширину: это подсказка при выборе, а не
 * отдельный раздел. Пустые поля просто не выводятся; если не заполнено
 * ничего — компонент не рисуется вовсе.
 */
export function CarrierTermsSummary({
  carrier,
  className,
}: {
  carrier: Partial<User> | null | undefined
  className?: string
}) {
  if (!hasCarrierTerms(carrier)) return null
  const c = carrier!

  const containers = (c.terms_container_types ?? [])
    .map(v => CONTAINER_TYPES.find(t => t.value === v)?.label || v)
    .join(', ')

  const facts: { label: string; value: string }[] = []
  if (containers) facts.push({ label: 'Возит', value: containers })
  if (c.terms_min_rate != null) facts.push({ label: 'Мин. ставка', value: `${c.terms_min_rate.toLocaleString('ru-RU')} ₽/рейс` })
  if (c.terms_overweight_fee != null) facts.push({ label: 'Перевес', value: `${c.terms_overweight_fee.toLocaleString('ru-RU')} ₽/т` })
  if (c.terms_cargo_excluded?.trim()) facts.push({ label: 'Не берёт', value: c.terms_cargo_excluded.trim() })

  return (
    <div className={cn('rounded-field border border-hairline bg-surface-sunken px-3 py-2.5', className)}>
      <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">
        Условия работы
      </div>
      <dl className="flex flex-col gap-1">
        {facts.map(f => (
          <div key={f.label} className="flex gap-2 text-[13px] leading-snug">
            <dt className="text-ink-3 shrink-0">{f.label}:</dt>
            <dd className="text-ink-2 min-w-0">{f.value}</dd>
          </div>
        ))}
      </dl>
      {c.terms_comment?.trim() && (
        <p className="mt-1.5 text-[13px] leading-snug text-ink-3 italic">{c.terms_comment.trim()}</p>
      )}
    </div>
  )
}
