'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Package, LogOut, User, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export function Navbar() {
  const { user } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const isClient = user?.role === 'client'
  const isCarrier = user?.role === 'carrier'

  const links = isClient
    ? [
        { href: '/dashboard', label: 'Мои заявки' },
        { href: '/orders/new', label: '+ Новая заявка' },
        { href: '/trucks', label: 'Найти машину' },
        { href: '/stats', label: 'Статистика' },
      ]
    : isCarrier
    ? [
        { href: '/feed', label: 'Лента заявок' },
        { href: '/my-responses', label: 'Мои отклики' },
        { href: '/my-trucks', label: 'Мои машины' },
        { href: '/stats', label: 'Статистика' },
      ]
    : []

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Вы вышли из системы')
    router.push('/auth/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href={isCarrier ? '/feed' : '/dashboard'} className="flex items-center gap-2 font-bold text-blue-600 text-lg">
            <Package size={22} />
            Контрейл
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop right */}
          <div className="hidden sm:flex items-center gap-2">
            <NotificationBell />
            <Link
              href="/profile"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === '/profile'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <User size={16} />
              {user?.name || 'Профиль'}
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <LogOut size={16} />
              Выйти
            </button>
          </div>

          {/* Mobile: bell + hamburger */}
          <div className="sm:hidden flex items-center gap-1">
            <NotificationBell />
            <button
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-50"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white px-4 py-2 space-y-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2"><User size={16} /> Профиль</span>
          </Link>
          <button
            onClick={() => { setMenuOpen(false); handleLogout() }}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
          >
            <LogOut size={16} /> Выйти
          </button>
        </div>
      )}
    </nav>
  )
}
