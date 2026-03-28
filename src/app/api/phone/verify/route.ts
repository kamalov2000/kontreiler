import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

const MAX_ATTEMPTS = 5

export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser()

  const { userId, phone, code } = await req.json()
  if (!userId || !phone || !code) {
    return NextResponse.json({ error: 'userId, phone and code required' }, { status: 400 })
  }

  if (!authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Находим актуальный код (не истёкший, не использованный)
  const { data: record } = await supabase
    .from('phone_verification_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('phone', phone)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Код не найден или истёк срок действия' }, { status: 400 })
  }

  // Защита от брутфорса
  if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Превышено количество попыток. Запросите новый код.' },
      { status: 429 }
    )
  }

  // Проверяем код
  if (record.code !== String(code)) {
    // Инкрементируем счётчик попыток
    await supabase
      .from('phone_verification_codes')
      .update({ attempts: (record.attempts ?? 0) + 1 })
      .eq('id', record.id)

    const remaining = MAX_ATTEMPTS - (record.attempts ?? 0) - 1
    return NextResponse.json(
      { error: `Неверный код. Осталось попыток: ${remaining}` },
      { status: 400 }
    )
  }

  // Помечаем код как использованный
  await supabase
    .from('phone_verification_codes')
    .update({ used: true })
    .eq('id', record.id)

  // Обновляем пользователя (через service role — минует ограничения RLS)
  const { error } = await supabase
    .from('users')
    .update({ is_phone_verified: true, phone })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
