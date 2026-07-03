import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-paper py-16 px-6">
      <article className="max-w-2xl mx-auto">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-accent">
          Правовая информация
        </span>
        <h1 className="mt-2 mb-1 text-[28px] leading-tight tracking-tight font-bold text-ink">
          Пользовательское соглашение
        </h1>
        <p className="font-mono text-xs text-ink-4">Редакция от 4 апреля 2026 г.</p>

        <div className="h-px bg-hairline my-5" />

        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            1 · Общие положения
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Настоящее Пользовательское соглашение регулирует отношения между ИП/ООО «Контрейл» (далее — «Платформа») и пользователями сервиса kontreiler.vercel.app (далее — «Сайт»).
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Платформа является информационным посредником и не является стороной договора перевозки между клиентом и перевозчиком.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            2 · Предмет соглашения
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Платформа предоставляет пользователям доступ к сервису для размещения заявок на перевозку контейнеров и поиска перевозчиков. Платформа не осуществляет перевозку грузов и не несёт ответственности за исполнение договорённостей между пользователями.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            3 · Роли пользователей
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">Клиент (грузовладелец)</strong> — физическое или юридическое лицо, размещающее заявки на перевозку контейнеров.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">Перевозчик</strong> — физическое или юридическое лицо, осуществляющее перевозку контейнеров и откликающееся на заявки клиентов.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            4 · Обязанности пользователей
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
            <li>Предоставлять достоверные сведения при регистрации.</li>
            <li>Не использовать Сайт в мошеннических целях.</li>
            <li>Самостоятельно оформлять все необходимые документы для перевозки груза.</li>
            <li>Соблюдать законодательство Российской Федерации при совершении сделок.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            5 · Ограничение ответственности
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">Платформа не несёт ответственности за:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
            <li>Утрату, порчу или задержку груза в ходе перевозки.</li>
            <li>Неисполнение или ненадлежащее исполнение обязательств одной из сторон сделки.</li>
            <li>Достоверность сведений, указанных пользователями.</li>
            <li>Финансовые споры между клиентом и перевозчиком.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            6 · Стоимость услуг
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Регистрация и использование Сайта бесплатны. Платформа оставляет за собой право ввести платные тарифы с предварительным уведомлением пользователей не менее чем за 30 дней.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            7 · Изменение соглашения
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Платформа вправе в одностороннем порядке изменять условия соглашения. Продолжение использования Сайта после публикации изменений означает согласие с новой редакцией.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            8 · Применимое право
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Настоящее соглашение регулируется законодательством Российской Федерации. Все споры разрешаются в соответствии с действующим законодательством РФ.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-hairline flex gap-4 text-sm">
          <Link href="/privacy" className="font-medium text-accent hover:underline">
            Политика конфиденциальности
          </Link>
          <Link href="/" className="text-ink-3 hover:underline">
            На главную
          </Link>
        </div>
      </article>
    </div>
  )
}
