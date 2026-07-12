'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Order, OrderStop, OrderDriverInfo, User, VatType } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  order: Order
  stops: OrderStop[]
  carrier: User | null
  driverInfo: OrderDriverInfo | null
}

/** Ставка НДС в процентах. `vat20` = 22% — ключ enum легаси, ставка актуальная (как в договоре и торгах). */
const VAT_PERCENT: Record<VatType, number | null> = {
  none: null, // без НДС
  vat0: 0,
  vat5: 5,
  vat15: 15,
  vat20: 22,
}

function vatLabel(vat: VatType): string {
  const p = VAT_PERCENT[vat]
  return p === null ? 'Без НДС' : `НДС ${p}%`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function money(n: number): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Секция бланка: номер + заголовок + поля. */
function FormSection({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-hairline rounded-card overflow-hidden">
      <header className="flex items-center gap-2 bg-surface-sunken px-3.5 py-2 border-b border-hairline">
        <span className="font-mono tabular-nums text-[11.5px] font-semibold text-accent">{no}</span>
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</h3>
      </header>
      <div className="p-3.5 space-y-3">{children}</div>
    </section>
  )
}

export function TnModal({ open, onClose, order, stops, carrier, driverInfo }: Props) {
  const [downloading, setDownloading] = useState(false)
  // Режим копии: дубль накладной по тому же маршруту, где меняются только
  // номер контейнера и дата (несколько контейнеров одним рейсом).
  const [copyMode, setCopyMode] = useState(false)

  const isRef = order.container_type.includes('REF')

  // Маршрут: погрузка → промежуточные точки (order_stops) → выгрузка.
  const route = useMemo(() => {
    const parts = [order.from_city, order.via_city, ...stops.map(s => s.address), order.to_city]
    return parts.filter(Boolean).join(' — ')
  }, [order.from_city, order.via_city, order.to_city, stops])

  const orderNumber = order.order_number ?? `КТ-${order.id.slice(0, 6).toUpperCase()}`
  const carrierRequisites = carrier
    ? [carrier.company_name || carrier.name, carrier.inn ? `ИНН ${carrier.inn}` : null]
        .filter(Boolean).join(', ')
    : ''

  const pickupAddress = [order.from_city, order.from_city_address].filter(Boolean).join(', ')
  const unloadAddress = [order.to_city, order.to_city_address].filter(Boolean).join(', ')
  const pickupDatetime = [fmtDate(order.ready_date), order.ready_time].filter(Boolean).join(' ')

  const vehicle = [driverInfo?.vehicle_brand, driverInfo?.vehicle_plate].filter(Boolean).join(', ')

  // ── Состояние формы ──
  const [tnDate, setTnDate] = useState('')
  const [tnNumber, setTnNumber] = useState('')
  const [consignee, setConsignee] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [cargoName, setCargoName] = useState('')
  const [placesCount, setPlacesCount] = useState('')
  const [placesUnit, setPlacesUnit] = useState('шт')
  const [weightGross, setWeightGross] = useState('')
  const [weightNet, setWeightNet] = useState('')
  const [routeField, setRouteField] = useState('')
  const [deadline, setDeadline] = useState('')
  const [forwardingContact, setForwardingContact] = useState('')
  const [temperature, setTemperature] = useState('')
  const [seal, setSeal] = useState('')
  const [carrierReqField, setCarrierReqField] = useState('')
  const [driverName, setDriverName] = useState('')
  const [vehicleField, setVehicleField] = useState('')
  const [trailerPlate, setTrailerPlate] = useState('')
  const [pickupAddrField, setPickupAddrField] = useState('')
  const [pickupDtField, setPickupDtField] = useState('')
  const [containerNumber, setContainerNumber] = useState('')
  const [unloadAddrField, setUnloadAddrField] = useState('')
  const [unloadDtField, setUnloadDtField] = useState('')
  const [costNoVat, setCostNoVat] = useState('')

  // Автозаполнение при каждом открытии: дата ТН — СЕГОДНЯ (не дата создания заявки).
  useEffect(() => {
    if (!open) return
    setCopyMode(false)
    setTnDate(new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    setTnNumber(orderNumber)
    setConsignee('')
    setDeliveryAddress(unloadAddress)
    setCargoName('')
    setPlacesCount('')
    setPlacesUnit('шт')
    setWeightGross(order.weight_gross != null ? String(order.weight_gross) : '')
    setWeightNet(order.weight_net != null ? String(order.weight_net) : '')
    setRouteField(route)
    setDeadline(fmtDateTime(order.arrival_time))
    setForwardingContact('')
    setTemperature('')
    setSeal('')
    setCarrierReqField(carrierRequisites)
    setDriverName(driverInfo?.driver_name ?? '')
    setVehicleField(vehicle)
    setTrailerPlate(driverInfo?.trailer_plate ?? '')
    setPickupAddrField(pickupAddress)
    setPickupDtField(pickupDatetime)
    setContainerNumber('')
    setUnloadAddrField(unloadAddress)
    setUnloadDtField(fmtDateTime(order.arrival_time))
    const cost = order.agreed_price ?? order.price
    setCostNoVat(cost != null ? String(cost) : '')
  }, [open, order, route, carrierRequisites, driverInfo, vehicle, pickupAddress, unloadAddress, pickupDatetime, orderNumber])

  // Стоимость с НДС считается из «без НДС» и ставки заявки.
  const vatPercent = VAT_PERCENT[order.vat_type] ?? 0
  const costWithVat = useMemo(() => {
    const base = parseFloat(costNoVat.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(base)) return ''
    return money(base * (1 + vatPercent / 100))
  }, [costNoVat, vatPercent])

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch('/api/generate-tn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          tn_date: tnDate,
          tn_number: tnNumber,
          order_number: orderNumber,
          order_date: fmtDate(order.created_at),
          consignee_requisites: consignee,
          delivery_address: deliveryAddress,
          cargo_name: cargoName,
          places_count: placesCount,
          places_unit: placesUnit,
          weight_gross: weightGross,
          weight_net: weightNet,
          route: routeField,
          delivery_deadline: deadline,
          forwarding_contact: forwardingContact,
          // не-REF контейнер → секция температуры в PDF не печатается вовсе
          temperature_mode: isRef ? temperature : null,
          seal,
          carrier_requisites: carrierReqField,
          driver_name: driverName,
          vehicle: vehicleField,
          trailer_plate: trailerPlate,
          pickup_address: pickupAddrField,
          pickup_datetime: pickupDtField,
          container_number: containerNumber,
          unload_address: unloadAddrField,
          unload_datetime: unloadDtField,
          cost_no_vat: costNoVat ? money(parseFloat(costNoVat.replace(/\s/g, '').replace(',', '.')) || 0) : '',
          vat_rate: vatLabel(order.vat_type),
          cost_with_vat: costWithVat,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Ошибка генерации накладной')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TN-${tnNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Накладная скачана')
    } catch {
      toast.error('Ошибка при скачивании накладной')
    } finally {
      setDownloading(false)
    }
  }

  // В режиме копии редактируются только номер контейнера и дата.
  const locked = copyMode

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Транспортная накладная"
      className="sm:max-w-2xl"
    >
      {copyMode && (
        <div className="mb-4 flex items-start gap-2 rounded-card border border-hairline bg-accent-soft px-3.5 py-2.5">
          <Lock size={14} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.5} />
          <div className="text-sm text-ink-2">
            <span className="font-semibold text-ink">Копия накладной.</span>{' '}
            Меняются только номер контейнера и дата — остальные поля зафиксированы по оригиналу.{' '}
            <button
              onClick={() => setCopyMode(false)}
              className="font-medium text-accent underline underline-offset-2"
            >
              Вернуться к полному редактированию
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3.5">
        <FormSection no="1" title="Шапка">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Дата" value={tnDate} onChange={e => setTnDate(e.target.value)} />
            <Input label="Номер накладной" value={tnNumber} onChange={e => setTnNumber(e.target.value)} disabled={locked} />
            <Input label="Дата заказа" value={fmtDate(order.created_at)} disabled />
          </div>
        </FormSection>

        <FormSection no="2" title="Грузополучатель">
          <Input
            label="Реквизиты грузополучателя"
            placeholder="ООО «Ромашка», ИНН 7707083893"
            value={consignee}
            onChange={e => setConsignee(e.target.value)}
            disabled={locked}
          />
          <Input
            label="Адрес места доставки"
            value={deliveryAddress}
            onChange={e => setDeliveryAddress(e.target.value)}
            disabled={locked}
          />
        </FormSection>

        <FormSection no="3" title="Груз">
          <Input
            label="Наименование груза"
            placeholder="Товары народного потребления"
            value={cargoName}
            onChange={e => setCargoName(e.target.value)}
            disabled={locked}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2">
              <Input
                label="Количество мест"
                type="number"
                value={placesCount}
                onChange={e => setPlacesCount(e.target.value)}
                disabled={locked}
              />
              <div className="w-24 shrink-0">
                <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Ед.
                </label>
                <select
                  value={placesUnit}
                  onChange={e => setPlacesUnit(e.target.value)}
                  disabled={locked}
                  className="h-11 w-full rounded-field border border-hairline bg-surface px-2 text-[15px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:bg-surface-sunken disabled:text-ink-4"
                >
                  <option value="шт">шт</option>
                  <option value="кг">кг</option>
                  <option value="м³">м³</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Вес брутто, кг" value={weightGross} onChange={e => setWeightGross(e.target.value)} disabled={locked} />
              <Input label="Вес нетто, кг" value={weightNet} onChange={e => setWeightNet(e.target.value)} disabled={locked} />
            </div>
          </div>
        </FormSection>

        <FormSection no="5" title="Особые условия">
          <Input label="Маршрут перевозки" value={routeField} onChange={e => setRouteField(e.target.value)} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Срок доставки" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={locked} />
            <Input
              label="Контактное лицо для переадресовки"
              value={forwardingContact}
              onChange={e => setForwardingContact(e.target.value)}
              disabled={locked}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Температурный режим — только для рефрижераторных контейнеров */}
            {isRef && (
              <Input
                label="Температурный режим"
                placeholder="−18 °C"
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                disabled={locked}
              />
            )}
            <Input label="ЗПУ" value={seal} onChange={e => setSeal(e.target.value)} disabled={locked} />
          </div>
        </FormSection>

        <FormSection no="6" title="Перевозчик">
          <Input
            label="Реквизиты перевозчика"
            value={carrierReqField}
            onChange={e => setCarrierReqField(e.target.value)}
            disabled={locked}
          />
          <Input label="ФИО водителя" value={driverName} onChange={e => setDriverName(e.target.value)} disabled={locked} />
        </FormSection>

        <FormSection no="7" title="Транспортное средство">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Марка и госномер тягача"
              value={vehicleField}
              onChange={e => setVehicleField(e.target.value)}
              disabled={locked}
            />
            <Input
              label="Госномер прицепа"
              value={trailerPlate}
              onChange={e => setTrailerPlate(e.target.value)}
              disabled={locked}
            />
          </div>
        </FormSection>

        <FormSection no="8" title="Приём груза">
          <Input label="Адрес места погрузки" value={pickupAddrField} onChange={e => setPickupAddrField(e.target.value)} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Заявленные дата и время подачи" value={pickupDtField} onChange={e => setPickupDtField(e.target.value)} disabled={locked} />
            {/* Номера контейнера в заявке нет (там только тип) — вводится вручную.
                В режиме копии это одно из двух редактируемых полей. */}
            <Input
              label="Контейнер №"
              placeholder="MSKU 123456-7"
              value={containerNumber}
              onChange={e => setContainerNumber(e.target.value)}
            />
          </div>
          <Input label="ФИО водителя" value={driverName} disabled />
        </FormSection>

        <FormSection no="10" title="Выдача груза">
          <Input label="Адрес места выгрузки" value={unloadAddrField} onChange={e => setUnloadAddrField(e.target.value)} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Заявленные дата и время" value={unloadDtField} onChange={e => setUnloadDtField(e.target.value)} disabled={locked} />
            <Input label="ФИО водителя" value={driverName} disabled />
          </div>
        </FormSection>

        <FormSection no="12" title="Стоимость перевозки">
          <Input label="Реквизиты перевозчика" value={carrierReqField} disabled />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Стоимость без НДС, ₽"
              value={costNoVat}
              onChange={e => setCostNoVat(e.target.value)}
              disabled={locked}
              className="font-mono tabular-nums"
            />
            <Input label="Налоговая ставка" value={vatLabel(order.vat_type)} disabled />
            <Input label="Стоимость с НДС, ₽" value={costWithVat} disabled className="font-mono tabular-nums" />
          </div>
        </FormSection>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={handleDownload} loading={downloading} className="flex-1">
          <Download size={15} className="mr-1.5" strokeWidth={1.5} />
          Скачать PDF
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setCopyMode(true)
            setContainerNumber('')
            toast.info('Копия: измените номер контейнера и дату')
          }}
          disabled={downloading || copyMode}
        >
          <Copy size={15} className="mr-1.5" strokeWidth={1.5} />
          Копировать накладную
        </Button>
      </div>
    </Modal>
  )
}
