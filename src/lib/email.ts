interface EmailPayload {
  to: string
  subject: string
  html: string
}

// Если домен не верифицирован в Resend — используй onboarding@resend.dev
// Задай RESEND_FROM_EMAIL=noreply@yourdomain.com когда домен пройдёт верификацию
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Контрейл <onboarding@resend.dev>'

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log('[EMAIL STUB — задайте RESEND_API_KEY]', {
      to: payload.to,
      subject: payload.subject,
      body: payload.html.replace(/<[^>]+>/g, '').trim(),
    })
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  })

  if (error) {
    console.error('[EMAIL ERROR]', error)
    throw new Error(error.message)
  }
}
