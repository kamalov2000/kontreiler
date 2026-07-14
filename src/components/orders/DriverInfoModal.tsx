'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { normalizePlate } from '@/lib/utils'
import { OrderDriverInfo } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  orderId: string
  initial: OrderDriverInfo | null
  onSaved: (info: OrderDriverInfo) => void
}

/**
 * Данные водителя и ТС — заполняет ПЕРЕВОЗЧИК после того, как клиент его принял.
 * Все поля необязательны: можно закрыть модалку и дозаполнить позже кнопкой
 * «Добавить данные водителя» на странице заявки. Отсюда данные подтягиваются
 * в транспортную накладную (разделы 6, 7, 8, 10, 12).
 */
export function DriverInfoModal({ open, onClose, orderId, initial, onSaved }: Props) {
  const [driverName, setDriverName] = useState('')
  const [vehicleBrand, setVehicleBrand] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [trailerPlate, setTrailerPlate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDriverName(initial?.driver_name ?? '')
    setVehicleBrand(initial?.vehicle_brand ?? '')
    setVehiclePlate(initial?.vehicle_plate ?? '')
    setTrailerPlate(initial?.trailer_plate ?? '')
  }, [open, initial])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const payload = {
      order_id: orderId,
      driver_name: driverName.trim() || null,
      vehicle_brand: vehicleBrand.trim() || null,
      vehicle_plate: normalizePlate(vehiclePlate) || null,
      trailer_plate: normalizePlate(trailerPlate) || null,
    }
    // Одна строка на заявку (UNIQUE order_id) — повторное заполнение правит её.
    const { data, error } = await supabase
      .from('order_driver_info')
      .upsert(payload, { onConflict: 'order_id' })
      .select()
      .single()

    setSaving(false)
    if (error) {
      toast.error('Не удалось сохранить данные водителя')
      return
    }
    toast.success('Данные водителя сохранены')
    onSaved(data as OrderDriverInfo)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Данные водителя и транспорта">
      <p className="mb-4 text-sm text-ink-3">
        Эти данные подставятся в транспортную накладную. Поля необязательны —
        можно пропустить и заполнить позже.
      </p>

      <div className="space-y-3">
        <Input
          label="ФИО водителя"
          placeholder="Иванов Иван Иванович"
          value={driverName}
          onChange={e => setDriverName(e.target.value)}
        />
        <Input
          label="Марка транспортного средства"
          placeholder="Volvo FH"
          value={vehicleBrand}
          onChange={e => setVehicleBrand(e.target.value)}
        />
        <Input
          label="Госномер тягача"
          placeholder="А123ВС 777"
          value={vehiclePlate}
          onChange={e => setVehiclePlate(e.target.value)}
        />
        <Input
          label="Госномер прицепа (необязательно)"
          placeholder="АА1234 77"
          value={trailerPlate}
          onChange={e => setTrailerPlate(e.target.value)}
        />
      </div>

      <div className="mt-5 flex gap-2">
        <Button onClick={handleSave} loading={saving} className="flex-1">
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Позже
        </Button>
      </div>
    </Modal>
  )
}
