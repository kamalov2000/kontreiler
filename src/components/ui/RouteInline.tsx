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
    <span className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      {points.map((point, i) => (
        <Fragment key={i}>
          {/* min-w 11px = сама точка (5px) с отступами: ниже рельса не
              схлопывается, но в тесных строках отдаёт место городам */}
          {i > 0 && (
            <span className="flex-1 flex items-center min-w-[11px]">
              <span className="flex-1 rail" />
              <span className="w-[5px] h-[5px] rounded-full bg-ink-3 mx-[3px] flex-none" />
              <span className="flex-1 rail" />
            </span>
          )}
          {/* truncate, а не просто nowrap: без overflow-hidden флекс-элемент
              не сжимается и вылезает поверх соседей в узких ячейках списка */}
          <span
            title={point}
            className={`text-[15px] font-semibold truncate ${via && i === 1 ? 'text-ink-2' : 'text-ink'}`}
          >
            {point}
          </span>
        </Fragment>
      ))}
      {urgent && (
        <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-danger whitespace-nowrap flex-none">
          Срочно
        </span>
      )}
    </span>
  )
}
