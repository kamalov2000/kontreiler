'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { normalizePlate, normalizePhone, isValidPhone } from '@/lib/utils'
import { OrderDriverInfo, hasRequiredDriverInfo } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  orderId: string
  initial: OrderDriverInfo | null
  onSaved: (info: OrderDriverInfo) => void
}

/**
 * Данные водителя и ТС — заполняет ПЕРЕВОЗЧИК после того, как клиент его принял.
 * Отсюда данные подтягиваются в договор-заявку и в транспортную накладную
 * (разделы 6, 7, 8, 10, 12).
 *
 * ФИО, госномер тягача и телефон водителя обязательны: пока их нет, клиент не
 * может скачать документы по заявке. Внесение не принудительное — перевозчик
 * закрывает модалку и возвращается к ней кнопкой на странице заявки.
 */
export function DriverInfoModal({ open, onClose, orderId, initial, onSaved }: Props) {
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [passportData, setPassportData] = useState('')
  const [vehicleBrand, setVehicleBrand] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [trailerPlate, setTrailerPlate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDriverName(initial?.driver_name ?? '')
    setDriverPhone(initial?.driver_phone ?? '')
    setPassportData(initial?.passport_data ?? '')
    setVehicleBrand(initial?.vehicle_brand ?? '')
    setVehiclePlate(initial?.vehicle_plate ?? '')
    setTrailerPlate(initial?.trailer_plate ?? '')
    setErrors({})
  }, [open, initial])

  async function handleSave() {
    const next: Record<string, string> = {}
    if (!driverName.trim()) next.driverName = 'Укажите ФИО водителя'
    if (!vehiclePlate.trim()) next.vehiclePlate = 'Укажите госномер тягача'
    if (!driverPhone.trim()) next.driverPhone = 'Укажите телефон водителя'
    else if (!isValidPhone(driverPhone)) next.driverPhone = 'Некорректный номер телефона'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    const supabase = createClient()
    const payload = {
      order_id: orderId,
      driver_name: driverName.trim(),
      driver_phone: normalizePhone(driverPhone.trim()),
      passport_data: passportData.trim() || null,
      vehicle_brand: vehicleBrand.trim() || null,
      vehicle_plate: normalizePlate(vehiclePlate),
      trailer_plate: normalizePlate(trailerPlate) || null,
    }
    // Одна строка на заявку (UNIQUE order_id) — повторное заполнение правит её.
    const { data, error } = await supabase
      .from('order_driver_info')
      .upsert(payload, { onConflict: 'order_id' })
      .select()
      .single()

    if (error) {
      setSaving(false)
      toast.error('Не удалось сохранить данные водителя')
      return
    }

    // Клиента уведомляет сервер: перевозчик по RLS не может ни писать
    // уведомления, ни трогать заявку (флаг баннера driver_info_seen).
    // Замену отличаем от первого заполнения — тексты и баннер разные.
    const wasFilled = hasRequiredDriverInfo(initial)
    await fetch('/api/orders/driver-info-changed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, changed: wasFilled }),
    }).catch(() => {})

    setSaving(false)
    toast.success(wasFilled ? 'Данные водителя обновлены' : 'Данные водителя сохранены')
    onSaved(data as OrderDriverInfo)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Данные водителя и транспорта">
      <p className="mb-4 text-sm text-ink-3">
        Данные подставятся в договор-заявку и транспортную накладную. Пока не заполнены
        поля со звёздочкой, клиент не сможет скачать документы по этой заявке.
      </p>

      <div className="space-y-3">
        <Input
          label="ФИО водителя *"
          placeholder="Иванов Иван Иванович"
          value={driverName}
          onChange={e => setDriverName(e.target.value)}
          error={errors.driverName}
        />
        <Input
          label="Телефон водителя *"
          type="tel"
          placeholder="+7 900 123-45-67"
          value={driverPhone}
          onChange={e => setDriverPhone(e.target.value)}
          error={errors.driverPhone}
        />
        <Input
          label="Госномер тягача *"
          placeholder="А123ВС 777"
          value={vehiclePlate}
          onChange={e => setVehiclePlate(e.target.value)}
          error={errors.vehiclePlate}
        />
        <Input
          label="Госномер прицепа"
          placeholder="АА1234 77"
          value={trailerPlate}
          onChange={e => setTrailerPlate(e.target.value)}
        />
        <Input
          label="Марка транспортного средства"
          placeholder="Volvo FH"
          value={vehicleBrand}
          onChange={e => setVehicleBrand(e.target.value)}
        />
        <div>
          <Input
            label="Паспортные данные водителя"
            placeholder="4510 123456, выдан ..."
            value={passportData}
            onChange={e => setPassportData(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-ink-3">
            Попадают только в документы — на странице заявки не отображаются.
          </p>
        </div>
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
