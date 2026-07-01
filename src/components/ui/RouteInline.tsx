/** Маршрут «Откуда ──·── Куда» с пунктирной рельсой. Морской фрахт. */
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
  return (
    <span className={`flex items-center gap-2 min-w-0 ${className}`}>
      <span className="text-[15px] font-semibold text-ink whitespace-nowrap">{from}</span>
      <span className="flex-1 flex items-center min-w-[28px]">
        <span className="flex-1 rail" />
        <span className="w-[5px] h-[5px] rounded-full bg-ink-3 mx-[3px] flex-none" />
        <span className="flex-1 rail" />
      </span>
      <span className="text-[15px] font-semibold text-ink whitespace-nowrap">{to}</span>
      {via && <span className="text-xs text-ink-3 whitespace-nowrap">через {via}</span>}
      {urgent && (
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-danger whitespace-nowrap">
          Срочно
        </span>
      )}
    </span>
  )
}
