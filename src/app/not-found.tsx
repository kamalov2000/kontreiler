import Link from 'next/link'
import { Package } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-2xl mb-8">
        <Package size={28} />
        Контрейл
      </Link>
      <div className="text-8xl font-black text-gray-200 mb-4">404</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Страница не найдена</h1>
      <p className="text-gray-500 mb-8 max-w-sm">
        Возможно, ссылка устарела или страница была удалена.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors text-sm"
        >
          На главную
        </Link>
        <Link
          href="/feed"
          className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          Лента заявок
        </Link>
      </div>
    </div>
  )
}
