import { Navbar } from './Navbar'
import { PhoneVerifyBanner } from './PhoneVerifyBanner'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <PhoneVerifyBanner />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
