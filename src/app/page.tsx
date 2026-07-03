import Link from 'next/link'
import { Check } from 'lucide-react'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { LiveClock } from '@/components/ui/LiveClock'
import { createServiceClient } from '@/lib/supabase/service'
import { RUSSIAN_CITIES } from '@/lib/cities'

// Кэшируем страницу на 5 минут — быстрая отдача без запроса к БД на каждый заход.
export const revalidate = 300

// Запасной демо-набор доски — показывается, только если активных заявок нет.
const FALLBACK_ROWS = [
  { from: 'Москва', to: 'Новосибирск', chip: '40HC', price: '185 000 ₽', urgent: false },
  { from: 'Новороссийск', to: 'Москва', chip: '20DC', price: '128 000 ₽', urgent: true },
  { from: 'Владивосток', to: 'Хабаровск', chip: '40REF', price: '96 000 ₽', urgent: false },
  { from: 'Казань', to: 'Челябинск', chip: '20DC2', price: '117 000 ₽', urgent: false },
]

interface BoardRow { from: string; to: string; chip: string; price: string; urgent: boolean }

// Тянет реальные данные для героя: последние активные заявки + счётчики.
// Всё через service-клиент (сервер), чтобы не упираться в RLS для публичной страницы.
async function getBoard(): Promise<{ rows: BoardRow[]; active: number; carriers: number }> {
  try {
    const sb = createServiceClient()
    const [ordersRes, activeRes, carriersRes] = await Promise.all([
      sb.from('orders')
        .select('from_city,to_city,container_type,price,is_negotiable,is_urgent,format')
        .eq('status', 'active').order('created_at', { ascending: false }).limit(4),
      sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('users').select('id', { count: 'exact', head: true }).eq('role', 'carrier'),
    ])
    const rows: BoardRow[] = (ordersRes.data ?? []).map(o => ({
      from: o.from_city,
      to: o.to_city,
      chip: String(o.container_type || '').toUpperCase(),
      price: o.is_negotiable || !o.price ? 'Договорная' : `${o.price.toLocaleString('ru-RU')} ₽`,
      urgent: !!o.is_urgent || o.format === 'urgent',
    }))
    return {
      rows: rows.length ? rows : FALLBACK_ROWS,
      active: activeRes.count ?? rows.length,
      carriers: carriersRes.count ?? 0,
    }
  } catch {
    return { rows: FALLBACK_ROWS, active: 0, carriers: 0 }
  }
}

const CLIENT_POINTS = [
  'Все откликнувшиеся с контактами и рейтингом',
  'Торги: редукцион и аукцион на понижение ставки',
  'Трекинг рейса из 7 стадий и договор из шаблона',
]
const CARRIER_POINTS = [
  'Живая доска заявок с фильтрами по маршруту',
  'Телефон клиента сразу после отклика',
  'Сохранённые маршруты и доска ваших машин',
]

export default async function LandingPage() {
  const { rows, active, carriers } = await getBoard()
  const cities = RUSSIAN_CITIES.length
  return (
    <div className="min-h-screen bg-paper">
      {/* Nav */}
      <nav className="flex items-center justify-between h-14 px-5 sm:px-10 bg-paper border-b border-hairline">
        <span className="flex items-center gap-2">
          <ContainerMark size={20} />
          <span className="text-lg font-bold tracking-[-0.02em] text-ink">Контрейл</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-sm font-medium text-ink-2 hover:text-ink transition-colors">
            Войти
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex items-center min-h-[40px] px-[18px] rounded-card bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Регистрация
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_460px] gap-12 px-5 sm:px-10 py-12 sm:py-16 items-center">
        <div className="flex flex-col gap-5">
          <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-accent">
            Биржа контейнерных перевозок
          </span>
          <h1 className="text-[40px] sm:text-5xl leading-[1.05] tracking-[-0.02em] font-bold text-ink text-balance">
            Фрахт в реальном времени. Без посредников.
          </h1>
          <p className="text-[17px] leading-relaxed text-ink-2 max-w-[460px]">
            Разместите заявку за 30 секунд — перевозчики увидят её сразу и свяжутся с вами напрямую.
            Телефон открывается после отклика.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center min-h-[44px] px-[22px] rounded-card bg-accent text-white text-[15px] font-medium hover:bg-accent-hover transition-colors"
            >
              Разместить заявку
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center min-h-[44px] px-[22px] rounded-card border border-hairline bg-surface text-ink text-[15px] font-medium hover:border-border-strong transition-colors"
            >
              Найти загрузку
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 font-mono text-[13px] tabular-nums text-ink-3">
            {active > 0 && (
              <>
                <span><span className="text-ink font-medium">{active.toLocaleString('ru-RU')}</span> активных заявок</span>
                <span className="text-border-strong">·</span>
              </>
            )}
            {carriers > 0 && (
              <>
                <span><span className="text-ink font-medium">{carriers.toLocaleString('ru-RU')}</span> перевозчиков</span>
                <span className="text-border-strong">·</span>
              </>
            )}
            <span><span className="text-ink font-medium">{cities}</span> городов</span>
          </div>
        </div>

        {/* Живой мок доски */}
        <div className="border border-hairline rounded-modal bg-surface overflow-hidden shadow-overlay">
          <div className="flex items-center gap-2 h-10 px-4 border-b border-hairline bg-surface-sunken">
            <span className="text-[13px] font-semibold text-ink">Доска заявок</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-success">
              <span className="w-[5px] h-[5px] rounded-full bg-success" />Live
            </span>
            <span className="flex-1" />
            <LiveClock />
          </div>
          {rows.map((r, i) => (
            <div
              key={`${r.from}-${r.to}-${i}`}
              className={`flex items-center gap-2.5 h-12 px-4 ${i < rows.length - 1 ? 'border-b border-hairline' : ''} ${i === 0 ? 'bg-accent-soft shadow-row-active' : ''}`}
            >
              <span className="flex-1 text-sm font-semibold text-ink">
                {r.from} <span className="text-border-strong">──·──</span> {r.to}
                {r.urgent && <span className="ml-1.5 text-[10px] font-semibold tracking-[0.08em] text-danger">СРОЧНО</span>}
              </span>
              <span className="px-1.5 py-0.5 rounded-field border border-hairline bg-surface-sunken text-ink-2 font-mono text-[10px] font-medium uppercase">
                {r.chip}
              </span>
              <span className="font-mono text-[13px] font-medium tabular-nums text-ink">{r.price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Как это работает */}
      <section className="max-w-6xl mx-auto px-5 sm:px-10 py-10 border-t border-hairline">
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { n: '01', h: 'Размещаете заявку', p: 'Маршрут, тип контейнера, дата — 30 секунд, и заявка на доске.' },
            { n: '02', h: 'Перевозчики откликаются', p: 'Доска обновляется в реальном времени — без перезагрузки страницы.' },
            { n: '03', h: 'Договариваетесь напрямую', p: 'Контакты открываются после отклика — звоните и везите.' },
          ].map(s => (
            <div key={s.n} className="flex flex-col gap-2 pl-4 border-l border-hairline">
              <span className="font-mono text-[13px] text-accent">{s.n}</span>
              <span className="text-lg leading-tight font-semibold text-ink">{s.h}</span>
              <span className="text-sm leading-relaxed text-ink-3">{s.p}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Две роли */}
      <section className="max-w-6xl mx-auto grid sm:grid-cols-2 gap-6 px-5 sm:px-10 pb-12">
        {[
          { over: 'Грузовладельцам', h: 'Заявка за 30 секунд', points: CLIENT_POINTS, cta: 'Разместить заявку →' },
          { over: 'Перевозчикам', h: 'Загрузка без простоя', points: CARRIER_POINTS, cta: 'Найти загрузку →' },
        ].map(card => (
          <div key={card.over} className="border border-hairline rounded-card bg-surface p-6 flex flex-col gap-3.5">
            <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">{card.over}</span>
            <span className="text-2xl leading-tight tracking-[-0.01em] font-semibold text-ink">{card.h}</span>
            <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-ink-2">
              {card.points.map(p => (
                <span key={p} className="flex gap-2 items-start">
                  <Check size={15} strokeWidth={2.5} className="text-accent shrink-0 mt-[3px]" />
                  {p}
                </span>
              ))}
            </div>
            <Link href="/auth/register" className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors mt-1">
              {card.cta}
            </Link>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="bg-ink px-5 sm:px-10 py-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-3xl leading-tight tracking-[-0.015em] font-bold text-surface">Готовы начать?</span>
            <span className="font-mono text-[13px] text-ink-4">регистрация бесплатна · без скрытых платежей</span>
          </div>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center min-h-[48px] px-[26px] rounded-card bg-accent text-white text-[15px] font-medium hover:bg-accent-hover transition-colors shrink-0"
          >
            Зарегистрироваться
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-ink border-t border-white/10 px-5 sm:px-10 py-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-ink-3">© 2026 Контрейл · биржа контейнерных перевозок</span>
          <div className="flex gap-4 text-xs text-ink-4">
            <Link href="/terms" className="hover:text-surface transition-colors">Условия</Link>
            <Link href="/privacy" className="hover:text-surface transition-colors">Конфиденциальность</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
