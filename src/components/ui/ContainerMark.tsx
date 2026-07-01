/**
 * Фирменный знак «Контрейл» — контейнер (морской фрахт).
 * Обводка = currentColor, по умолчанию акцент. Меняйте размер через size.
 */
export function ContainerMark({ size = 20, className = 'text-accent' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.5" y="4.5" width="17" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="4.5" x2="7" y2="15.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="4.5" x2="13" y2="15.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
