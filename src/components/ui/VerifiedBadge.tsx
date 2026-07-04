import { ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface VerifiedBadgeProps {
  verified?: boolean | null
  // В плотных карточках ленты показываем только иконку с подсказкой
  iconOnly?: boolean
}

// Бейдж «проверенная компания» — показывается контрагентам как сигнал доверия.
// Источник истины — users.is_verified (проставляется вручную/модерацией).
export function VerifiedBadge({ verified, iconOnly = false }: VerifiedBadgeProps) {
  const { t } = useLanguage()
  if (!verified) return null
  return (
    <span
      title={t.profile.verified}
      className="inline-flex items-center gap-1 text-success shrink-0 align-middle"
    >
      <ShieldCheck size={14} strokeWidth={1.75} className="shrink-0" />
      {!iconOnly && <span className="text-xs font-medium">{t.profile.verified}</span>}
    </span>
  )
}
