import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

// Валидация российского телефона
const PHONE_RE = /^\+?[78]\d{10}$|^\d{10}$/

export async function POST(req: Request) {
  // Проверяем сессию — userId должен совпадать с аутентифицированным пользователем
  const supabaseAuth = await createClient()
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser()

  const { userId, phone } = await req.json()
  if (!userId || !phone) {
    return NextResponse.json({ error: 'userId and phone required' }, { status: 400 })
  }

  if (!authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Валидация формата телефона
  const digitsOnly = String(phone).replace(/\D/g, '')
  if (!PHONE_RE.test(String(phone)) && !(digitsOnly.length === 10 || digitsOnly.length === 11)) {
    return NextResponse.json({ error: 'Неверный формат телефона' }, { status: 400 })
  }
  if (digitsOnly.length < 10 || digitsOnly.length > 11) {
    return NextResponse.json({ error: 'Неверный формат телефона' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Rate limit: максимум 3 кода за 10 минут
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('phone_verification_codes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', tenMinutesAgo)

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Подождите 10 минут.' },
      { status: 429 }
    )
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Удаляем старые неиспользованные коды
  await supabase
    .from('phone_verification_codes')
    .delete()
    .eq('user_id', userId)
    .eq('used', false)

  const { error } = await supabase.from('phone_verification_codes').insert({
    user_id: userId,
    phone,
    code,
    expires_at: expiresAt,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to create code' }, { status: 500 })
  }

  if (process.env.TWILIO_AUTH_TOKEN) {
    // TODO: Production — отправить через Twilio
  } else {
    // В проде телефон не логируем — только последние 2 цифры
    const masked = phone.slice(-2).padStart(phone.length, '*')
    console.log(`[SMS DEV] Телефон: ${masked} | Код: ${code}`)
  }

  return NextResponse.json({ ok: true })
}
