// Единый деловой HTML-макет письма «Контрейл».
// Табличная вёрстка + инлайн-стили — для совместимости с почтовыми клиентами
// (Gmail, Outlook, Apple Mail, mail.ru, Яндекс). Никаких внешних CSS/шрифтов/скриптов.
//
// Палитра «Морской фрахт»: accent #0E6E6E, ink #10201F, paper #F3F5F4,
// surface #FBFCFB, hairline #DDE3E1.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kontreiler.vercel.app'
// Контактный e-mail показываем в подвале только если он задан в окружении —
// не выдумываем несуществующий адрес поддержки.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ''
const SITE_LABEL = APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

const FONT_STACK =
  "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export interface EmailContent {
  /** Тема-заголовок в теле письма (H1). */
  heading: string
  /** Готовый HTML абзацев тела. Пользовательские данные должны быть экранированы вызывающим. */
  bodyHtml: string
  /** Кнопка-CTA (необязательно). */
  cta?: { label: string; url: string }
  /** Текст превью (скрытый прехедер в списке писем). */
  preview?: string
}

/** Кнопка-CTA табличной вёрсткой (bulletproof button). */
function ctaButton(label: string, url: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
    <tr>
      <td align="center" bgcolor="#0E6E6E" style="border-radius:10px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:13px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`
}

/**
 * Оборачивает контент письма в фирменный макет: шапка с логотипом,
 * карточка с телом, подпись команды и контакты.
 */
export function renderEmail(content: EmailContent): string {
  const { heading, bodyHtml, cta, preview } = content

  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Контрейл</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F5F4;">
  ${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F5F4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

          <!-- Шапка: логотип -->
          <tr>
            <td style="padding:4px 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="34" height="34" align="center" valign="middle" bgcolor="#0E6E6E"
                            style="width:34px;height:34px;border-radius:8px;color:#ffffff;font-family:${FONT_STACK};font-size:17px;font-weight:700;">К</td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle;font-family:${FONT_STACK};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#10201F;">
                    Контрейл
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Карточка -->
          <tr>
            <td style="background-color:#FBFCFB;border:1px solid #DDE3E1;border-radius:14px;overflow:hidden;">
              <!-- Акцентная полоса -->
              <div style="height:4px;background-color:#0E6E6E;line-height:4px;font-size:0;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:32px 36px 36px;">
                    <h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:#10201F;">
                      ${heading}
                    </h1>
                    <div style="font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#3A4A48;">
                      ${bodyHtml}
                    </div>
                    ${cta ? ctaButton(cta.label, cta.url) : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Подпись / подвал -->
          <tr>
            <td style="padding:24px 36px 8px;">
              <p style="margin:0 0 4px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:#3A4A48;">
                С уважением,<br />
                <strong style="color:#10201F;">команда Контрейл</strong>
              </p>
              <p style="margin:12px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:#64748B;">
                <a href="${APP_URL}" target="_blank" style="color:#0E6E6E;text-decoration:none;font-weight:600;">${SITE_LABEL}</a>
                ${SUPPORT_EMAIL ? ` &nbsp;·&nbsp; <a href="mailto:${SUPPORT_EMAIL}" style="color:#64748B;text-decoration:none;">${SUPPORT_EMAIL}</a>` : ''}
              </p>
              <p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:#94A3A0;">
                Биржа контейнерных перевозок. Это письмо отправлено автоматически — отвечать на него не нужно.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
