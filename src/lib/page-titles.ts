/**
 * Заголовки вкладок браузера.
 *
 * Все страницы отдавали один и тот же title из корневого layout, и две открытые
 * рядом вкладки различить было нечем — по иконке одинаковые, по подписи тоже.
 * Логист держит открытыми ленту, свои заявки и пару рейсов сразу.
 */

const SUFFIX = 'Контрейл'

/** Точные совпадения пути. Динамические разделы — в PREFIX_TITLES ниже. */
const EXACT_TITLES: Record<string, string> = {
  '/dashboard':       'Мои заявки',
  '/feed':            'Лента заявок',
  '/orders/new':      'Новая заявка',
  '/rate-requests':   'Запросы ставки',
  '/auctions':        'Торги',
  '/auctions/new':    'Новые торги',
  '/my-responses':    'Мои отклики',
  '/my-trucks':       'Мой транспорт',
  '/trucks':          'Найти машину',
  '/trucks/new':      'Разместить машину',
  '/counterparties':  'Контрагенты',
  '/stats':           'Статистика',
  '/profile':         'Профиль',
  '/help':            'Помощь',
}

/** Разделы с id в пути. Порядок важен: сначала более длинный префикс. */
const PREFIX_TITLES: [prefix: string, suffix: string, title: string][] = [
  ['/orders/', '/chat',     'Чат по заявке'],
  ['/orders/', '/tracking', 'Трекинг рейса'],
  ['/orders/', '',          'Заявка'],
  ['/trucks/', '/chat',     'Чат по машине'],
  ['/trucks/', '',          'Машина'],
]

/** Заголовок раздела по пути. Пусто — оставить общий заголовок сайта. */
export function titleForPath(pathname: string): string | null {
  const exact = EXACT_TITLES[pathname]
  if (exact) return exact

  for (const [prefix, suffix, title] of PREFIX_TITLES) {
    if (pathname.startsWith(prefix) && pathname.endsWith(suffix) && pathname.length > prefix.length + suffix.length) {
      return title
    }
  }
  return null
}

/** Ставит заголовок вкладки: «Заявка КТ-00395 — Контрейл». */
export function setPageTitle(title: string | null) {
  if (typeof document === 'undefined') return
  document.title = title ? `${title} — ${SUFFIX}` : `${SUFFIX} — биржа контейнерных перевозок`
}
