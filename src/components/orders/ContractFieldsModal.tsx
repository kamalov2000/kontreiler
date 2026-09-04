'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
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
 * Поля хранятся на заявке, поэтому клиент заполняет их один раз — дальше модалка
 * открывается уже с ними. Наименование груза и номер контейнера переиспользует
 * форма транспортной накладной; телефоны в ТН не идут — в бланке Приложения № 4
 * для них нет отдельной строки.
 */
export function ContractFieldsModal({
  open, onClose, order, ownPhone, onSaved, onConfirm, downloading,
}: Props) {
  const { t } = useLanguage()
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
      toast.error(t.order.docsSaveError)
      return
    }
    onSaved(updates)
    onConfirm()
  }

  return (
    <Modal open={open} onClose={onClose} title={t.order.docsModalTitle}>
      <p className="mb-4 text-sm text-ink-3">{t.order.docsModalHint}</p>

      <div className="space-y-3">
        <Input
          label={t.order.cargoName}
          placeholder={t.order.cargoNamePlaceholder}
          value={cargoName}
          onChange={e => setCargoName(e.target.value)}
        />
        <Input
          label={t.order.containerNumber}
          placeholder="MSKU1234567"
          value={containerNumber}
          onChange={e => setContainerNumber(e.target.value)}
        />
        <Input
          label={t.order.phoneLoading}
          type="tel"
          placeholder="+7 900 123-45-67"
          value={senderPhone}
          onChange={e => setSenderPhone(e.target.value)}
        />
        <Input
          label={t.order.phoneUnloading}
          type="tel"
          placeholder="+7 900 123-45-67"
          value={receiverPhone}
          onChange={e => setReceiverPhone(e.target.value)}
        />
      </div>

      <div className="mt-5 flex gap-2">
        <Button onClick={handleSubmit} loading={saving || downloading} className="flex-1">
          {downloading ? t.order.docsGenerating : t.order.docsDownload}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={saving || downloading}>
          {t.common.cancel}
        </Button>
      </div>
    </Modal>
  )
}
