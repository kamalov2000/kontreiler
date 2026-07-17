import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Круглый аватар компании: логотип из company-logos либо иконка-заглушка.
 * Используется в ленте машин, профиле, карточках перевозчиков.
 */
export function CompanyAvatar({
  src,
  size = 28,
  className,
  alt = 'Логотип компании',
}: {
  src?: string | null
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 border border-hairline bg-surface-sunken',
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={size} height={size} className="w-full h-full object-cover" />
      ) : (
        <Building2 size={Math.round(size * 0.5)} strokeWidth={1.5} className="text-ink-4" />
      )}
    </span>
  )
}
