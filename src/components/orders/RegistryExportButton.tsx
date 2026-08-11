'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, CircleAlert, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types/database'
import {
  downloadRegistry,
  matchesOrderNumbers,
  parseOrderNumbers,
  partyName,
  RegistryOrder,
  RegistryParty,
  REGISTRY_FORMATS,
} from '@/lib/registry'
import { cn } from '@/lib/utils'

interface Props {
  /** client — свои заявки, carrier — те, где перевозчик принят. */
  role: 'client' | 'carrier'
  user: User
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Период по умолчанию — текущий месяц целиком.
function currentMonth(): { from: string; to: string } {
  const now = new Date()
  return {
    from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to:   ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

const DATE_INPUT_CLASS =
  'w-full h-10 px-3 text-sm rounded-field border border-hairline bg-surface text-ink ' +
  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40'

/**
 * Реестр перевозок за период — выгрузка в Excel.
 * Период фильтруем по дате погрузки/выгрузки (ready_date): именно она стоит в
 * колонке «Дата» и по ней реестр сверяют с закрывающими документами.
 *
 * Перевозчику реестр нужен под конкретного клиента — поэтому у него есть выбор
 * компаний (список собирается из сделок за период) и поле номеров заявок.
 * Клиенту фильтровать не по кому: заявки и так только его.
 */
export function RegistryExportButton({ role, user }: Props) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(currentMonth)
  const [orders, setOrders] = useState<RegistryOrder[]>([])
  const [fetching, setFetching] = useState(false)
  const [building, setBuilding] = useState(false)

  // null = «все клиенты». Иначе — набор выбранных client_id.
  const [selectedClients, setSelectedClients] = useState<Set<string> | null>(null)
  const [clientsOpen, setClientsOpen] = useState(false)
  const [numbersInput, setNumbersInput] = useState('')

  const loadOrders = useCallback(async () => {
    if (!range.from || !range.to || range.from > range.to) { setOrders([]); return }
    setFetching(true)
    const supabase = createClient()
    const query = supabase
      .from('orders')
      .select('*, driver:order_driver_info(*), extras:order_extra_services(*), carrier:users!accepted_carrier_id(name, company_name, inn), client:users!client_id(name, company_name, inn)')
      .in('format', REGISTRY_FORMATS as unknown as string[])
      .gte('ready_date', range.from)
      .lte('ready_date', range.to)
      .order('ready_date', { ascending: true })

    const { data, error } = role === 'client'
      ? await query.eq('client_id', user.id)
      : await query.eq('accepted_carrier_id', user.id)

    if (error) {
      toast.error('Не удалось загрузить заявки для реестра')
      setOrders([])
    } else {
      setOrders((data || []) as RegistryOrder[])
    }
    setFetching(false)
  }, [range.from, range.to, role, user.id])

  useEffect(() => {
    if (!open) return
    loadOrders()
  }, [open, loadOrders])

  // Компании-клиенты, с которыми в периоде были сделки. Дубли схлопываем по id.
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of orders) {
      const label = partyName(o.client)
      if (o.client_id) map.set(o.client_id, label || 'Без названия')
    }
    return Array.from(map, ([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [orders])

  // Список клиентов пересобирается при смене периода — снимаем выбор,
  // который к новому периоду уже не относится.
  useEffect(() => { setSelectedClients(null) }, [range.from, range.to])

  const needles = useMemo(() => parseOrderNumbers(numbersInput), [numbersInput])

  const filtered = useMemo(() => orders.filter(o => {
    if (role === 'carrier' && selectedClients && !selectedClients.has(o.client_id)) return false
    return matchesOrderNumbers(o, needles)
  }), [orders, role, selectedClients, needles])

  // Реквизиты второй стороны попадают в шапку и в блок подписей, только когда
  // реестр собран под одного контрагента: документ, адресованный сразу
  // нескольким, подписывать некому.
  const counterpartyIds = useMemo(() => new Set(
    filtered.map(o => (role === 'carrier' ? o.client_id : o.accepted_carrier_id)).filter(Boolean)
  ), [filtered, role])
  const isSummary = counterpartyIds.size !== 1

  function toggleClient(id: string) {
    setSelectedClients(prev => {
      const all = clientOptions.map(c => c.id)
      const next = new Set(prev ?? all)
      if (next.has(id)) next.delete(id); else next.add(id)
      // Выбраны все — возвращаемся к «все клиенты», чтобы не городить лишнее
      // состояние и чтобы в шапке файла не появился случайный получатель.
      if (next.size === all.length) return null
      return next
    })
  }

  const selectedLabel = !selectedClients
    ? 'Все клиенты'
    : selectedClients.size === 1
    ? clientOptions.find(c => selectedClients.has(c.id))?.label ?? 'Выбран 1'
    : `Выбрано: ${selectedClients.size}`

  async function handleExport() {
    if (!range.from || !range.to) {
      toast.error('Укажите обе даты периода')
      return
    }
    if (range.from > range.to) {
      toast.error('Дата «с» позже даты «по»')
      return
    }
    if (filtered.length === 0) {
      toast.error('По выбранным условиям перевозок нет')
      return
    }

    setBuilding(true)
    try {
      // Реквизиты сторон в шапке и в блоке подписей. Получатель появляется,
      // только когда реестр собран под одного клиента — иначе документ
      // адресовать некому, и вторая колонка подписей остаётся бланком.
      const parties: RegistryParty[] = [
        { role, name: partyName(user) || user.name || '—', inn: user.inn },
      ]
      if (!isSummary) {
        const only = filtered[0]
        const p = role === 'carrier' ? only.client : only.carrier
        parties.push({
          role: role === 'carrier' ? 'client' : 'carrier',
          name: partyName(p) || '—',
          inn: p?.inn ?? null,
        })
      }

      // Сквозной номер реестра. Выдаётся один раз на выгрузку и сразу
      // фиксируется в журнале — поэтому берём его только когда файл точно
      // собирается, уже после всех проверок. Не выдался — выгружаем без номера:
      // документ нужнее, чем нумерация.
      const supabase = createClient()
      const { data: number, error: numberError } = await supabase
        .rpc('next_registry_number', { p_from: range.from, p_to: range.to })
      if (numberError) toast.warning('Реестр без номера: не удалось обратиться к журналу выгрузок')

      await downloadRegistry(filtered, {
        from: range.from,
        to: range.to,
        number: typeof number === 'number' ? number : null,
        parties,
      })
      toast.success(`Реестр выгружен: ${filtered.length} строк`)
      setOpen(false)
    } catch {
      toast.error('Не удалось сформировать реестр')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={15} className="mr-1" />
        Выгрузить реестр
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Реестр перевозок">
        <p className="mb-4 text-sm text-ink-3">
          {role === 'client'
            ? 'Ваши заявки с датой погрузки/выгрузки внутри периода. Торги в реестр не входят.'
            : 'Перевозки, где вы приняты, с датой погрузки/выгрузки внутри периода. Торги в реестр не входят.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="registryFrom" className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
              Период с
            </label>
            <input
              id="registryFrom"
              type="date"
              value={range.from}
              onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className={DATE_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="registryTo" className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
              Период по
            </label>
            <input
              id="registryTo"
              type="date"
              value={range.to}
              onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className={DATE_INPUT_CLASS}
            />
          </div>
        </div>

        {role === 'carrier' && (
          <>
            <div className="mt-4 flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Клиент</span>
              <button
                type="button"
                onClick={() => setClientsOpen(v => !v)}
                disabled={clientOptions.length === 0}
                className={cn(
                  'flex items-center justify-between h-10 px-3 text-sm rounded-field border border-hairline bg-surface text-ink',
                  'hover:border-border-strong transition-colors disabled:opacity-60 disabled:hover:border-hairline'
                )}
              >
                <span className={clientOptions.length === 0 ? 'text-ink-4' : ''}>
                  {fetching
                    ? 'Загрузка…'
                    : clientOptions.length === 0
                    ? 'За период сделок нет'
                    : selectedLabel}
                </span>
                <ChevronDown size={15} className={cn('text-ink-3 transition-transform', clientsOpen && 'rotate-180')} />
              </button>

              {clientsOpen && clientOptions.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-field border border-hairline bg-surface-sunken p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedClients(null)}
                    className="w-full text-left px-2 py-1.5 text-sm text-accent hover:bg-accent-soft rounded-[6px]"
                  >
                    Выбрать всех
                  </button>
                  {clientOptions.map(c => {
                    const checked = !selectedClients || selectedClients.has(c.id)
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-ink-2 hover:bg-surface rounded-[6px] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClient(c.id)}
                          className="w-4 h-4 rounded border-hairline accent-accent"
                        />
                        <span className="truncate">{c.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {fetching || filtered.length === 0 ? (
                <p className="text-xs text-ink-4">
                  Реестр под одного клиента подставит его реквизиты в шапку и в блок подписей.
                </p>
              ) : isSummary ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                  <CircleAlert size={13} className="mt-px shrink-0" />
                  <span>
                    В выборке несколько клиентов — реквизиты заказчика не подставятся ни в шапку,
                    ни в подписи. Получится сводный реестр для себя, а не документ на отправку.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-ink-4">
                  Реквизиты клиента подставятся в шапку и в блок подписей.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="registryNumbers" className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
                Номера заявок (необязательно)
              </label>
              <input
                id="registryNumbers"
                type="text"
                value={numbersInput}
                onChange={e => setNumbersInput(e.target.value)}
                placeholder="КТ-00068, КТ-00071"
                className={DATE_INPUT_CLASS}
              />
            </div>
          </>
        )}

        <div className="mt-4 text-sm text-ink-3">
          {fetching ? 'Считаем…' : `Попадёт в реестр: ${filtered.length}`}
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={handleExport} loading={building} disabled={fetching} className="flex-1">
            Выгрузить реестр
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={building}>
            Отмена
          </Button>
        </div>
      </Modal>
    </>
  )
}
