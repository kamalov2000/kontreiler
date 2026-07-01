import Link from 'next/link'
import { Navbar } from './Navbar'
import { EmailVerifyBanner } from './EmailVerifyBanner'
import { WelcomeModal } from '@/components/ui/WelcomeModal'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <Navbar />
      <EmailVerifyBanner />
      <WelcomeModal />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-hairline bg-surface mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 text-xs text-ink-4">
          <span className="font-mono">© {new Date().getFullYear()} Контрейл</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-ink-2 transition-colors">Пользовательское соглашение</Link>
            <Link href="/privacy" className="hover:text-ink-2 transition-colors">Политика конфиденциальности</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
