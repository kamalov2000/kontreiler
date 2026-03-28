interface EmailPayload {
  to: string
  subject: string
  html: string
}

/**
 * Отправляет email.
 * В dev-режиме (без RESEND_API_KEY) пишет в консоль.
 * В production устанавливает пакет `resend` и задаёт RESEND_API_KEY.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    // Production: установить пакет resend (`npm i resend`), задать RESEND_API_KEY
    // const { Resend } = await import('resend')
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({ from: 'Контрейл <noreply@kontreil.ru>', ...payload })
    console.log('[EMAIL PROD-STUB] resend пакет не установлен:', payload.subject)
    return
  }

  // Dev mode: логируем в консоль
  console.log('[EMAIL DEV]', {
    to: payload.to,
    subject: payload.subject,
    body: payload.html.replace(/<[^>]+>/g, '').trim(),
  })
}
