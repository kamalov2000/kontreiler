'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut, User, Menu, X } from 'lucide-react'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'

function initials(name?: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map(w => w[0]).join('')
  return letters.toUpperCase() || '—'
}

export function Navbar() {
  const { user } = useUser()
  const { t } = useLanguage()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const isClient = user?.role === 'client'
  const isCarrier = user?.role === 'carrier'

  const links: { href: string; label: string; badge?: number }[] = isClient
    ? [
        { href: '/dashboard', label: t.nav.myOrders },
        { href: '/trucks', label: t.nav.findTruck },
        { href: '/counterparties', label: 'Контрагенты' },
        { href: '/stats', label: t.nav.stats },
      ]
    : isCarrier
    ? [
        { href: '/feed', label: t.nav.feed },
        { href: '/my-responses', label: t.nav.myResponses },
        { href: '/my-trucks', label: t.nav.myTrucks },
        { href: '/counterparties', label: 'Контрагенты' },
        { href: '/stats', label: t.nav.stats },
      ]
    : []

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success(t.nav.logout)
    router.push('/auth/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="bg-surface border-b border-hairline sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link
            href={isCarrier ? '/feed' : '/dashboard'}
            className="flex items-center gap-2 flex-none"
          >
            <ContainerMark size={18} />
            <span className="text-base font-bold tracking-[-0.02em] text-ink">Контрейл</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-5 h-full flex-1 pl-6">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative inline-flex items-center gap-1.5 h-full text-[13px] font-medium transition-colors whitespace-nowrap',
                  isActive(link.href)
                    ? 'text-accent shadow-[inset_0_-2px_0_#0E6E6E]'
                    : 'text-ink-3 hover:text-ink'
                )}
              >
                {link.label}
                {link.badge ? (
                  <span className="font-mono text-[11px] px-1.5 rounded-full bg-accent-soft text-accent">
                    {link.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>

          {/* Desktop right */}
          <div className="hidden sm:flex items-center gap-2 flex-none">
            <LanguageSwitcher />
            <NotificationBell />
            <Link
              href="/profile"
              className={cn(
                'flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border transition-colors',
                pathname === '/profile'
                  ? 'border-accent'
                  : 'border-hairline hover:border-border-strong'
              )}
            >
              <span className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[11px] font-semibold">
                {initials(user?.company_name || user?.name)}
              </span>
              <span className="text-[13px] font-medium text-ink-2 max-w-[140px] truncate">
                {user?.name || t.nav.profile}
              </span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-9 h-9 rounded-card text-ink-3 hover:text-ink hover:bg-surface-sunken transition-colors"
              title={t.nav.logout}
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Mobile: bell + hamburger */}
          <div className="sm:hidden flex items-center gap-1">
            <NotificationBell />
            <button
              className="p-2 rounded-card text-ink-3 hover:bg-surface-sunken"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-hairline bg-surface px-4 py-2 space-y-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2.5 rounded-card text-sm font-medium transition-colors',
                isActive(link.href)
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-3 hover:bg-surface-sunken'
              )}
            >
              {link.label}
              {link.badge ? (
                <span className="font-mono text-[11px] px-1.5 rounded-full bg-accent-soft text-accent">
                  {link.badge}
                </span>
              ) : null}
            </Link>
          ))}
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-2.5 rounded-card text-sm text-ink-3 hover:bg-surface-sunken"
          >
            <span className="flex items-center gap-2"><User size={16} /> {t.nav.profile}</span>
          </Link>
          <div className="px-3 py-2">
            <LanguageSwitcher />
          </div>
          <button
            onClick={() => { setMenuOpen(false); handleLogout() }}
            className="w-full text-left px-3 py-2.5 rounded-card text-sm text-ink-3 hover:bg-surface-sunken flex items-center gap-2"
          >
            <LogOut size={16} /> {t.nav.logout}
          </button>
        </div>
      )}
    </nav>
  )
}
