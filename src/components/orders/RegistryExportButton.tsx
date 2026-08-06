'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { downloadRegistry, RegistryOrder } from '@/lib/registry'

interface Props {
  /** client — свои заявки, carrier — те, где перевозчик принят. */
  role: 'client' | 'carrier'
  userId: string
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
 */
export function RegistryExportButton({ role, userId }: Props) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(currentMonth)
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (!range.from || !range.to) {
      toast.error('Укажите обе даты периода')
      return
    }
    if (range.from > range.to) {
      toast.error('Дата «с» позже даты «по»')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const query = supabase
        .from('orders')
        .select('*, driver:order_driver_info(*), carrier:users!accepted_carrier_id(name, company_name)')
        .gte('ready_date', range.from)
        .lte('ready_date', range.to)
        .order('ready_date', { ascending: true })

      const { data, error } = role === 'client'
        ? await query.eq('client_id', userId)
        : await query.eq('accepted_carrier_id', userId)

      if (error) {
        toast.error('Не удалось загрузить заявки для реестра')
        return
      }
      const orders = (data || []) as RegistryOrder[]
      if (orders.length === 0) {
        toast.error('За выбранный период перевозок нет')
        return
      }

      await downloadRegistry(orders, range.from, range.to)
      toast.success(`Реестр выгружен: ${orders.length} строк`)
      setOpen(false)
    } catch {
      toast.error('Не удалось сформировать реестр')
    } finally {
      setLoading(false)
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
            ? 'Ваши заявки с датой погрузки/выгрузки внутри периода.'
            : 'Перевозки, где вы приняты, с датой погрузки/выгрузки внутри периода.'}
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

        <div className="mt-5 flex gap-2">
          <Button onClick={handleExport} loading={loading} className="flex-1">
            Выгрузить реестр
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
            Отмена
          </Button>
        </div>
      </Modal>
    </>
  )
}
