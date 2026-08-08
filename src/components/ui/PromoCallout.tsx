import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { cn } from '@/lib/utils'

/**
 * Акцентный призыв к главному действию раздела.
 *
 * `hero` — когда у пользователя ещё ничего нет: занимает основную часть экрана
 * вместо пустого списка. `compact` — когда данные уже есть: остаётся сверху
 * строкой, чтобы не спорить со списком за внимание.
 */
export function PromoCallout({
  title,
  description,
  href,
  cta,
  variant = 'compact',
  className,
}: {
  title: string
  description: string
  href: string
  cta: string
  variant?: 'hero' | 'compact'
  className?: string
}) {
  const isHero = variant === 'hero'

  return (
    <div
      className={cn(
        'rounded-card border border-accent bg-accent-soft',
        isHero ? 'px-6 py-10 sm:px-10 sm:py-14 text-center' : 'px-5 py-4',
        className
      )}
    >
      {isHero ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <ContainerMark size={32} className="text-accent" />
          <h2 className="text-[22px] sm:text-2xl font-bold tracking-[-0.01em] text-ink">{title}</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">{description}</p>
          <Link href={href} className="mt-2">
            <Button size="lg">
              {cta}
              <ArrowRight size={16} className="ml-1.5" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <ContainerMark size={22} className="text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">{title}</div>
              <div className="text-[13px] text-ink-2">{description}</div>
            </div>
          </div>
          <Link href={href} className="shrink-0">
            <Button size="md">
              {cta}
              <ArrowRight size={15} className="ml-1.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
