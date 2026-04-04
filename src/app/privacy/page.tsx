import Link from 'next/link'
import { Package } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-xl mb-8">
          <Package size={22} />
          Контрейл
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Политика конфиденциальности</h1>
          <p className="text-sm text-gray-400 mb-8">Редакция от 4 апреля 2026 г.</p>

          <div className="prose prose-sm text-gray-700 space-y-6">

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">1. Оператор персональных данных</h2>
              <p>Оператором персональных данных является владелец сервиса Контрейл (kontreiler.vercel.app). Обработка персональных данных осуществляется в соответствии с Федеральным законом №152-ФЗ «О персональных данных».</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">2. Какие данные мы собираем</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Адрес электронной почты (для входа и уведомлений).</li>
                <li>Имя, название компании (для отображения в профиле).</li>
                <li>Номер телефона (для связи между участниками сделок).</li>
                <li>Город (для фильтрации маршрутов).</li>
                <li>ИНН, номер лицензии (по желанию, для перевозчиков).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">3. Цели обработки данных</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Идентификация пользователя на Сайте.</li>
                <li>Обеспечение связи между клиентами и перевозчиками.</li>
                <li>Отправка уведомлений об откликах и сообщениях.</li>
                <li>Улучшение работы сервиса.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">4. Передача данных третьим лицам</h2>
              <p>Телефон пользователя видят только участники конкретной сделки (клиент и принятый перевозчик). Мы не продаём и не передаём персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ.</p>
              <p className="mt-2">Для хранения данных используется платформа Supabase (серверы в ЕС). Для отправки email используется сервис Resend.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">5. Хранение данных</h2>
              <p>Данные хранятся до момента удаления аккаунта пользователем. После удаления аккаунта персональные данные удаляются в течение 30 дней.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">6. Права пользователя</h2>
              <p>В соответствии с 152-ФЗ вы вправе:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Получить доступ к своим персональным данным.</li>
                <li>Потребовать исправления неточных данных.</li>
                <li>Потребовать удаления своих данных.</li>
                <li>Отозвать согласие на обработку персональных данных.</li>
              </ul>
              <p className="mt-2">Для реализации прав обратитесь через форму обратной связи на Сайте.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-2">7. Cookie</h2>
              <p>Сайт использует cookie-файлы для поддержания сессии авторизации. Без cookie корректная работа Сайта невозможна.</p>
            </section>

          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex gap-4 text-sm">
            <Link href="/terms" className="text-blue-600 hover:underline">Пользовательское соглашение</Link>
            <Link href="/" className="text-gray-500 hover:underline">На главную</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
