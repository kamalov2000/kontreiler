import Link from 'next/link'
import { Navbar } from './Navbar'
import { EmailVerifyBanner } from './EmailVerifyBanner'
import { WelcomeModal } from '@/components/ui/WelcomeModal'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <EmailVerifyBanner />
      <WelcomeModal />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Контрейл</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-gray-600 transition-colors">Пользовательское соглашение</Link>
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Политика конфиденциальности</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
