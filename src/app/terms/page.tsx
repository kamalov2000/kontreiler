import Link from 'next/link'
import { Package } from 'lucide-react'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-xl mb-8">
          <Package size={22} />
          Контрейл
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Пользовательское соглашение</h1>
          <p className="text-sm text-gray-400 mb-8">Редакция от 4 апреля 2026 г.</p>

          <div className="prose prose-sm text-gray-700 space-y-6">

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">1. Общие положения</h2>
              <p>Настоящее Пользовательское соглашение регулирует отношения между ИП/ООО «Контрейл» (далее — «Платформа») и пользователями сервиса kontreiler.vercel.app (далее — «Сайт»).</p>
              <p className="mt-2">Платформа является информационным посредником и не является стороной договора перевозки между клиентом и перевозчиком.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">2. Предмет соглашения</h2>
              <p>Платформа предоставляет пользователям доступ к сервису для размещения заявок на перевозку контейнеров и поиска перевозчиков. Платформа не осуществляет перевозку грузов и не несёт ответственности за исполнение договорённостей между пользователями.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">3. Роли пользователей</h2>
              <p><strong>Клиент (грузовладелец)</strong> — физическое или юридическое лицо, размещающее заявки на перевозку контейнеров.</p>
              <p className="mt-2"><strong>Перевозчик</strong> — физическое или юридическое лицо, осуществляющее перевозку контейнеров и откликающееся на заявки клиентов.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">4. Обязанности пользователей</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Предоставлять достоверные сведения при регистрации.</li>
                <li>Не использовать Сайт в мошеннических целях.</li>
                <li>Самостоятельно оформлять все необходимые документы для перевозки груза.</li>
                <li>Соблюдать законодательство Российской Федерации при совершении сделок.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">5. Ограничение ответственности</h2>
              <p>Платформа не несёт ответственности за:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Утрату, порчу или задержку груза в ходе перевозки.</li>
                <li>Неисполнение или ненадлежащее исполнение обязательств одной из сторон сделки.</li>
                <li>Достоверность сведений, указанных пользователями.</li>
                <li>Финансовые споры между клиентом и перевозчиком.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">6. Стоимость услуг</h2>
              <p>Регистрация и использование Сайта бесплатны. Платформа оставляет за собой право ввести платные тарифы с предварительным уведомлением пользователей не менее чем за 30 дней.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">7. Изменение соглашения</h2>
              <p>Платформа вправе в одностороннем порядке изменять условия соглашения. Продолжение использования Сайта после публикации изменений означает согласие с новой редакцией.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">8. Применимое право</h2>
              <p>Настоящее соглашение регулируется законодательством Российской Федерации. Все споры разрешаются в соответствии с действующим законодательством РФ.</p>
            </section>

          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex gap-4 text-sm">
            <Link href="/privacy" className="text-blue-600 hover:underline">Политика конфиденциальности</Link>
            <Link href="/" className="text-gray-500 hover:underline">На главную</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
