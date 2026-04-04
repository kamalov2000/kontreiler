import { Navbar } from './Navbar'
import { EmailVerifyBanner } from './EmailVerifyBanner'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <EmailVerifyBanner />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
