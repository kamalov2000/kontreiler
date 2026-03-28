import Link from 'next/link'
import { Package, ArrowRight, Zap, Phone } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-blue-600 text-lg">
            <Package size={22} />
            Контрейл
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
              Войти
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Регистрация
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
            Биржа контейнерных перевозок в реальном времени
          </h1>
          <p className="text-xl text-gray-500 mb-8">
            Разместите заявку за 30 секунд — перевозчики увидят её сразу и свяжутся с вами напрямую.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth/register"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 transition-colors"
            >
              Начать бесплатно
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/auth/login"
              className="flex items-center justify-center px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-base hover:bg-gray-50 transition-colors"
            >
              Войти в систему
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Как это работает</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <Zap size={28} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">1. Размещаете заявку</h3>
              <p className="text-gray-500 text-sm">Укажите маршрут, тип контейнера и дату — займёт 30 секунд</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <Package size={28} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">2. Перевозчики видят и откликаются</h3>
              <p className="text-gray-500 text-sm">Лента обновляется в реальном времени — перевозчики находят загрузки мгновенно</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <Phone size={28} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">3. Договариваетесь напрямую</h3>
              <p className="text-gray-500 text-sm">Контакты открываются сразу — звоните, договаривайтесь, везите</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Для грузовладельцев</h3>
            <ul className="space-y-2 text-gray-600 text-sm">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Заявка размещается за 30 секунд</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Видите всех откликнувшихся с контактами</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Управляете активными и архивными заявками</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Срочные заявки выделяются в ленте</li>
            </ul>
            <Link
              href="/auth/register"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Разместить заявку <ArrowRight size={14} />
            </Link>
          </div>

          <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Для перевозчиков</h3>
            <ul className="space-y-2 text-gray-600 text-sm">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Живая лента заявок без перезагрузки</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Фильтры по маршруту и типу контейнера</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> Телефон клиента сразу после отклика</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">✓</span> История всех ваших откликов</li>
            </ul>
            <Link
              href="/auth/register"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Найти загрузку <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Готовы начать?</h2>
          <p className="text-blue-100 mb-8">Регистрация бесплатна. Никаких скрытых платежей.</p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-600 font-bold text-base hover:bg-blue-50 transition-colors"
          >
            Зарегистрироваться бесплатно
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-400">
          © 2026 Контрейл. Биржа контейнерных перевозок.
        </div>
      </footer>
    </div>
  )
}
