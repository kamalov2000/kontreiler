'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/utils'
import { Order } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  order: Order
  /** Свой телефон клиента из профиля — дефолт для контакта отправителя. */
  ownPhone: string | null
  /** Поля сохранены в заявку — обновить её в состоянии страницы. */
  onSaved: (updates: Partial<Order>) => void
  /** Вызывается после сохранения: скачать договор. */
  onConfirm: () => void
  downloading?: boolean
}

/**
 * Дозаполнение полей, которых нет в самой заявке, но которые нужны документам:
 * наименование груза и номер контейнера (раздел 3 договора-заявки), телефоны
 * контактных лиц на погрузке и выгрузке (раздел 2).
 *
 * Поля хранятся на заявке и переиспользуются транспортной накладной — клиент
 * заполняет их один раз, дальше модалка открывается уже с ними.
 */
export function ContractFieldsModal({
  open, onClose, order, ownPhone, onSaved, onConfirm, downloading,
}: Props) {
  const [cargoName, setCargoName] = useState('')
  const [containerNumber, setContainerNumber] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCargoName(order.cargo_name ?? '')
    setContainerNumber(order.container_number ?? '')
    // Телефон отправителя по умолчанию — телефон клиента из профиля, но его
    // можно заменить: отгрузкой часто занимается другой сотрудник.
    setSenderPhone(order.sender_contact_phone ?? ownPhone ?? '')
    setReceiverPhone(order.receiver_contact_phone ?? '')
  }, [open, order, ownPhone])

  async function handleSubmit() {
    setSaving(true)
    const updates = {
      cargo_name: cargoName.trim() || null,
      container_number: containerNumber.trim().toUpperCase() || null,
      sender_contact_phone: senderPhone.trim() ? normalizePhone(senderPhone.trim()) : null,
      receiver_contact_phone: receiverPhone.trim() ? normalizePhone(receiverPhone.trim()) : null,
    }
    const supabase = createClient()
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    setSaving(false)
    if (error) {
      toast.error('Не удалось сохранить данные для документа')
      return
    }
    onSaved(updates)
    onConfirm()
  }

  return (
    <Modal open={open} onClose={onClose} title="Данные для договора-заявки">
      <p className="mb-4 text-sm text-ink-3">
        Эти поля попадут в договор-заявку и подставятся в транспортную накладную.
        Достаточно заполнить один раз — в следующий раз они уже будут здесь.
      </p>

      <div className="space-y-3">
        <Input
          label="Наименование груза"
          placeholder="Оборудование в ящиках"
          value={cargoName}
          onChange={e => setCargoName(e.target.value)}
        />
        <Input
          label="Номер контейнера"
          placeholder="MSKU1234567"
          value={containerNumber}
          onChange={e => setContainerNumber(e.target.value)}
        />
        <Input
          label="Телефон сотрудника-отправителя"
          type="tel"
          placeholder="+7 900 123-45-67"
          value={senderPhone}
          onChange={e => setSenderPhone(e.target.value)}
        />
        <Input
          label="Телефон грузополучателя"
          type="tel"
          placeholder="+7 900 123-45-67"
          value={receiverPhone}
          onChange={e => setReceiverPhone(e.target.value)}
        />
      </div>

      <div className="mt-5 flex gap-2">
        <Button onClick={handleSubmit} loading={saving || downloading} className="flex-1">
          {downloading ? 'Формируем...' : 'Скачать договор-заявку'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={saving || downloading}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}
