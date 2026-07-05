import { Fragment } from 'react'

/** Маршрут «Откуда ──·── [через] ──·── Куда» с пунктирной рельсой. Морской фрахт.
 *  Промежуточная точка (via) показывается отдельным узлом между началом и концом. */
export function RouteInline({
  from,
  to,
  via,
  urgent,
  className = '',
}: {
  from: string
  to: string
  via?: string | null
  urgent?: boolean
  className?: string
}) {
  const points = via ? [from, via, to] : [from, to]
  return (
    <span className={`flex items-center gap-2 min-w-0 ${className}`}>
      {points.map((point, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="flex-1 flex items-center min-w-[20px]">
              <span className="flex-1 rail" />
              <span className="w-[5px] h-[5px] rounded-full bg-ink-3 mx-[3px] flex-none" />
              <span className="flex-1 rail" />
            </span>
          )}
          <span className={`text-[15px] font-semibold whitespace-nowrap ${via && i === 1 ? 'text-ink-2' : 'text-ink'}`}>
            {point}
          </span>
        </Fragment>
      ))}
      {urgent && (
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-danger whitespace-nowrap">
          Срочно
        </span>
      )}
    </span>
  )
}
