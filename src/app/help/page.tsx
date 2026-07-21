'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import {
  UserCircle, PackagePlus, Search, MessageSquare, FileText,
  ShieldCheck, Bell, Gavel, Truck, HelpCircle, ChevronDown,
  type LucideIcon,
} from 'lucide-react'

type Section = {
  id: string
  icon: LucideIcon
  title: string
  for: 'all' | 'client' | 'carrier'
  body: React.ReactNode
}

const overline = 'text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3'

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink-2">{children}</p>
}
function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-[15px] leading-relaxed text-ink-2">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}
const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>

const SECTIONS: Section[] = [
  {
    id: 'profile', icon: UserCircle, title: 'Профиль и реквизиты', for: 'all',
    body: (
      <div className="space-y-2">
        <P>Заполните профиль полностью — это влияет на доверие контрагентов и на документы.</P>
        <UL items={[
          <><B>Основное:</B> имя, телефон, город, название компании и ИНН. Кнопка «По ИНН» подтягивает реквизиты автоматически.</>,
          <><B>Логотип компании</B> — загрузите его в профиле; он показывается в лентах заявок и машин.</>,
          <><B>Реквизиты для договор-заявки</B> (КПП, ОГРН, банк, подписант) — раскройте отдельный блок «PDF». Без них договор сформируется без части полей.</>,
          <><B>Скрыть телефон</B> — тумблер под номером. Контрагенты будут видеть только кнопку чата.</>,
        ]} />
      </div>
    ),
  },
  {
    id: 'create-order', icon: PackagePlus, title: 'Как создать заявку', for: 'client',
    body: (
      <div className="space-y-2">
        <P>Кнопка «Разместить заявку» → форма. Ключевые поля:</P>
        <UL items={[
          <><B>Маршрут:</B> откуда, (транзит), куда. Можно указать точные адреса и добавить промежуточные точки.</>,
          <><B>Тип контейнера и вес:</B> тара подставляется автоматически по типу — её можно скорректировать (у рефконтейнеров вес ориентировочный, зависит от установки). Вес груза (брутто/нетто) — по желанию.</>,
          <><B>Формат:</B> обычная, срочная, редукцион или аукцион (торги на цену).</>,
          <><B>Ставка и НДС</B>, срок действия заявки, простой транспорта (₽/час).</>,
          <><B>Комментарий</B> — особые условия, видны перевозчикам в ленте.</>,
          <><B>Только для контрагентов</B> — заявку увидят лишь ваши контрагенты.</>,
        ]} />
        <P>После публикации заявка появляется в ленте перевозчиков в реальном времени.</P>
      </div>
    ),
  },
  {
    id: 'find-truck', icon: Search, title: 'Поиск машины', for: 'client',
    body: <P>Раздел «Найти машину» — лента свободных машин перевозчиков с фильтрами по маршруту и типу контейнера. Можно связаться с перевозчиком и предложить свой рейс.</P>,
  },
  {
    id: 'feed', icon: Truck, title: 'Лента заявок и отклики', for: 'carrier',
    body: (
      <div className="space-y-2">
        <P>Раздел «Лента» — активные заявки клиентов в реальном времени. Фильтры по маршруту, типу, поиск по номеру. У каждой заявки виден логотип и рейтинг клиента.</P>
        <UL items={[
          <><B>Откликнуться</B> — отправляет отклик с комментарием; клиент получит уведомление.</>,
          <><B>«Мои отклики»</B> — все ваши отклики с поиском и фильтрацией по статусу.</>,
          <><B>«Мои машины»</B> — разместите свободную машину, чтобы клиенты находили вас сами.</>,
        ]} />
      </div>
    ),
  },
  {
    id: 'auctions', icon: Gavel, title: 'Торги (редукцион и аукцион)', for: 'all',
    body: <P>В формате торгов цена определяется ставками. <B>Редукцион</B> — перевозчики снижают цену; <B>аукцион</B> — повышают. Все торги собраны в разделе «Торги». Можно включить автоопределение победителя и автопродление.</P>,
  },
  {
    id: 'chat', icon: MessageSquare, title: 'Чат и уведомления', for: 'all',
    body: (
      <div className="space-y-2">
        <P>По каждой заявке/рейсу доступен чат между сторонами. Колокольчик показывает новые отклики, сообщения и изменения.</P>
        <UL items={[
          'Уведомление о новом сообщении в чате не пропадает, пока вы не откроете его в колокольчике.',
          'Клиенту приходят уведомления о корректировках заявки — с описанием, что именно изменилось.',
        ]} />
      </div>
    ),
  },
  {
    id: 'tracking', icon: Bell, title: 'Статус и трекинг рейса', for: 'all',
    body: <P>После принятия отклика заявка проходит статусы: активна → есть перевозчик → в пути → доставлено. Если включён трекинг, перевозчик отмечает этапы, а клиент видит статус рейса.</P>,
  },
  {
    id: 'documents', icon: FileText, title: 'Документы: договор-заявка и ТН', for: 'all',
    body: (
      <div className="space-y-2">
        <P>На странице заявки (после того как назначен перевозчик) доступны документы:</P>
        <UL items={[
          <><B>Договор-заявка (PDF)</B> — формируется по данным заявки и реквизитам сторон из профилей. Заполните реквизиты заранее.</>,
          <><B>Транспортная накладная (ТН)</B> — по форме Приложения № 4. Часть полей подтягивается из заявки автоматически, остальное заполняется и редактируется в форме.</>,
          <><B>Файлы к заявке</B> — стороны могут прикреплять документы (PDF, фото, Excel) и скачивать их. У кого файл загружен, тот может его удалить.</>,
        ]} />
      </div>
    ),
  },
  {
    id: 'orders-status', icon: HelpCircle, title: 'Куда попадают заявки', for: 'client',
    body: (
      <UL items={[
        <><B>Активные</B> — опубликованные и ещё действующие.</>,
        <><B>Просроченные</B> — истёк срок действия или прошла плановая дата погрузки/выгрузки.</>,
        <><B>Доставленные</B> — завершённые рейсы (во «Все заявки»).</>,
        <><B>Отменённые</B> — отменённые вручную после публикации.</>,
      ]} />
    ),
  },
  {
    id: 'privacy', icon: ShieldCheck, title: 'Безопасность и приватность', for: 'all',
    body: (
      <div className="space-y-2">
        <UL items={[
          'Телефон и банковские реквизиты хранятся приватно и видны только вам и контрагенту по сделке.',
          'Тумблер «Скрыть телефон» в профиле прячет ваш номер от всех — остаётся только чат.',
          'Контрагенты: добавляйте проверенных партнёров и делайте заявки только для них.',
        ]} />
        <P>Платформа — информационный посредник и не является стороной договора перевозки.</P>
      </div>
    ),
  },
]

function Accordion({ section, defaultOpen }: { section: Section; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = section.icon
  return (
    <div className="bg-surface rounded-card border border-hairline overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-sunken transition-colors"
      >
        <span className="w-8 h-8 rounded-card bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <Icon size={17} strokeWidth={1.75} />
        </span>
        <span className="flex-1 font-semibold text-ink">{section.title}</span>
        <ChevronDown size={18} className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-hairline">{section.body}</div>}
    </div>
  )
}

export default function HelpPage() {
  const { user } = useUser()
  const role = user?.role

  // Сначала разделы для текущей роли, затем общие и для другой роли
  const sorted = [...SECTIONS].sort((a, b) => {
    const rank = (s: Section) => (s.for === role ? 0 : s.for === 'all' ? 1 : 2)
    return rank(a) - rank(b)
  })

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <span className={overline}>Инструкция</span>
        <h1 className="mt-1.5 mb-1 text-2xl font-bold tracking-[-0.01em] text-ink">Как работать с Контрейлом</h1>
        <p className="text-[15px] text-ink-3 mb-6">
          Короткий гид по платформе{role ? (role === 'client' ? ' для клиента' : ' для перевозчика') : ''}. Нажмите на раздел, чтобы раскрыть.
        </p>
        <div className="space-y-2.5">
          {sorted.map((s, i) => (
            <Accordion key={s.id} section={s} defaultOpen={i === 0} />
          ))}
        </div>
        <p className="mt-6 text-[13px] text-ink-4">
          Остались вопросы? Напишите в поддержку — мы поможем разобраться.
        </p>
      </div>
    </AppLayout>
  )
}
