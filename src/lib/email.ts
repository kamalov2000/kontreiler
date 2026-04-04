interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log('[EMAIL DEV]', {
      to: payload.to,
      subject: payload.subject,
      body: payload.html.replace(/<[^>]+>/g, '').trim(),
    })
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'Контрейл <noreply@kontreiler.ru>',
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  })
}
