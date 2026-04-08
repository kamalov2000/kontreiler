import { NextResponse } from 'next/server'

/**
 * GET /api/test-email?to=email@example.com
 * Тестирует Resend интеграцию — отправляет письмо.
 * Только для dev/проверки, в production скрыть или удалить.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const to = searchParams.get('to')

  if (!to) {
    return NextResponse.json({ error: 'Передайте ?to=email@example.com' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'RESEND_API_KEY не задан',
      hint: 'Добавьте RESEND_API_KEY в переменные окружения Vercel',
    }, { status: 503 })
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Контрейл <onboarding@resend.dev>'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kontreiler.vercel.app'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Тест Resend — Контрейл',
      html: `<p>Тестовое письмо от платформы <strong>Контрейл</strong>.</p>
             <p>RESEND_API_KEY: ✅ задан<br>
             FROM: ${fromEmail}<br>
             APP_URL: ${appUrl}</p>
             <p><a href="${appUrl}">Перейти на платформу</a></p>`,
    })

    if (error) {
      return NextResponse.json({ ok: false, error, from: fromEmail, app_url: appUrl }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      message: `Письмо отправлено на ${to}`,
      resend_id: data?.id,
      from: fromEmail,
      app_url: appUrl,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
