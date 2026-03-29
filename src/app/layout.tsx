import type { Metadata } from 'next'
import { ClientProviders } from '@/components/ClientProviders'
import './globals.css'

export const metadata: Metadata = {
  title: 'Контрейл — биржа контейнерных перевозок',
  description: 'Маркетплейс для грузовладельцев и перевозчиков контейнеров',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
