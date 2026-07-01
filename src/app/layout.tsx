import type { Metadata } from 'next'
import { Onest, Martian_Mono } from 'next/font/google'
import { ClientProviders } from '@/components/ClientProviders'
import './globals.css'

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
})

const martianMono = Martian_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Контрейл — биржа контейнерных перевозок',
  description: 'Фрахт в реальном времени. Разместите заявку за 30 секунд — перевозчики увидят её сразу.',
  openGraph: {
    title: 'Контрейл — биржа контейнерных перевозок',
    description: 'Фрахт в реальном времени. Без посредников.',
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Контрейл',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={`${onest.variable} ${martianMono.variable}`}>
      <body className="antialiased">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
