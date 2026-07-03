import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper py-16 px-6">
      <article className="max-w-2xl mx-auto">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-accent">
          Правовая информация
        </span>
        <h1 className="mt-2 mb-1 text-[28px] leading-tight tracking-tight font-bold text-ink">
          Политика конфиденциальности
        </h1>
        <p className="font-mono text-xs text-ink-4">Редакция от 4 апреля 2026 г.</p>

        <div className="h-px bg-hairline my-5" />

        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            1 · Оператор персональных данных
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Оператором персональных данных является владелец сервиса Контрейл (kontreiler.vercel.app). Обработка персональных данных осуществляется в соответствии с Федеральным законом №152-ФЗ «О персональных данных».
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            2 · Какие данные мы собираем
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
            <li>Адрес электронной почты (для входа и уведомлений).</li>
            <li>Имя, название компании (для отображения в профиле).</li>
            <li>Номер телефона (для связи между участниками сделок).</li>
            <li>Город (для фильтрации маршрутов).</li>
            <li>ИНН, номер лицензии (по желанию, для перевозчиков).</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            3 · Цели обработки данных
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
            <li>Идентификация пользователя на Сайте.</li>
            <li>Обеспечение связи между клиентами и перевозчиками.</li>
            <li>Отправка уведомлений об откликах и сообщениях.</li>
            <li>Улучшение работы сервиса.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            4 · Передача данных третьим лицам
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Телефон пользователя видят только участники конкретной сделки (клиент и принятый перевозчик). Мы не продаём и не передаём персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Для хранения данных используется платформа Supabase (серверы в ЕС). Для отправки email используется сервис Resend.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            5 · Хранение данных
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Данные хранятся до момента удаления аккаунта пользователем. После удаления аккаунта персональные данные удаляются в течение 30 дней.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            6 · Права пользователя
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">В соответствии с 152-ФЗ вы вправе:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
            <li>Получить доступ к своим персональным данным.</li>
            <li>Потребовать исправления неточных данных.</li>
            <li>Потребовать удаления своих данных.</li>
            <li>Отозвать согласие на обработку персональных данных.</li>
          </ul>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Для реализации прав обратитесь через форму обратной связи на Сайте.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            7 · Cookie
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Сайт использует cookie-файлы для поддержания сессии авторизации. Без cookie корректная работа Сайта невозможна.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-hairline flex gap-4 text-sm">
          <Link href="/terms" className="font-medium text-accent hover:underline">
            Пользовательское соглашение
          </Link>
          <Link href="/" className="text-ink-3 hover:underline">
            На главную
          </Link>
        </div>
      </article>
    </div>
  )
}
