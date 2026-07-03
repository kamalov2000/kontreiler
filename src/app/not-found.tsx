import Link from 'next/link'
import { ContainerMark } from '@/components/ui/ContainerMark'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 text-center">
      <div className="flex items-center gap-2 mb-4">
        <ContainerMark size={20} />
        <span className="text-base font-bold tracking-tight text-ink">Контрейл</span>
      </div>
      <div className="font-mono tabular-nums text-[56px] leading-none font-medium text-ink mb-4">404</div>
      <p className="text-sm text-ink-3 max-w-sm mb-6">
        Контейнер уехал не по тому маршруту. Такой страницы нет.
      </p>
      <div className="flex gap-2.5">
        <Link
          href="/feed"
          className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-field bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          На доску заявок
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-field bg-surface border border-hairline text-ink text-sm font-medium hover:bg-surface-sunken transition-colors"
        >
          Назад
        </Link>
      </div>
    </div>
  )
}
