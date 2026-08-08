import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // API маршруты — пропускаем без проверки ролей
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Публичные маршруты (лендинг, авторизация, правовые страницы —
  // доступны без входа, на них ведут ссылки из футера и регистрации)
  if (pathname === '/' || pathname.startsWith('/auth') || pathname === '/privacy' || pathname === '/terms') {
    if (user && (pathname === '/' || pathname === '/auth/login' || pathname === '/auth/register')) {
      // Получаем роль пользователя
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'carrier') {
        return NextResponse.redirect(new URL('/feed', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Защищённые маршруты — требуют авторизации
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Получаем роль для защиты маршрутов
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  // Профиль не создан (крайне редко — обычно создаётся триггером при регистрации).
  // Отправляем в профиль, а не на несуществующий /auth/complete-profile.
  if (!profile && pathname !== '/profile') {
    return NextResponse.redirect(new URL('/profile', request.url))
  }

  const role = profile?.role

  // Маршруты доступны обоим ролям.
  // `new` из «деталей» исключаем явно: без этого /orders/new и /trucks/new
  // подходили под шаблон идентификатора, пропускались здесь и до проверки
  // ролей не доходили — страницы создания были открыты обеим ролям.
  const isChatRoute = /^\/orders\/[^/]+\/chat/.test(pathname)
    || /^\/trucks\/[^/]+\/chat/.test(pathname)
  const isTrackingRoute = /^\/orders\/[^/]+\/tracking/.test(pathname)
  const isTruckDetail   = /^\/trucks\/(?!new$)[^/]+$/.test(pathname)
  const isOrderDetail   = /^\/orders\/(?!new$)[^/]+$/.test(pathname)   // детали заявки

  if (
    pathname === '/stats' ||
    pathname === '/profile' ||
    pathname === '/counterparties' ||
    pathname === '/auctions' ||   // доска торгов — обоим, но не /auctions/new
    isChatRoute || isTrackingRoute || isTruckDetail || isOrderDetail
  ) {
    return supabaseResponse
  }

  // Маршруты только для клиентов: свои заявки, создание заявки и торгов,
  // просмотр доски свободных машин. '/trucks' сверяем точным равенством —
  // иначе под него попадает /trucks/new, который как раз перевозчицкий.
  const clientRoutes = ['/dashboard', '/orders/new', '/auctions/new']
  const isClientRoute = clientRoutes.some(r => pathname.startsWith(r))
    || pathname === '/trucks'

  // Маршруты только для перевозчиков (включая публикацию своей машины)
  const carrierRoutes = ['/feed', '/my-responses', '/my-trucks', '/trucks/new']
  const isCarrierRoute = carrierRoutes.some(r => pathname.startsWith(r))

  if (isClientRoute && role !== 'client') {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  if (isCarrierRoute && role !== 'carrier') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
