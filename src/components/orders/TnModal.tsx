'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

function parseMoney(v: string): number {
  const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** Тип владения ТС — нумерация из бланка (раздел 7). */
const OWNERSHIP_TYPES = [
  { value: '1', label: '1 — собственность' },
  { value: '2', label: '2 — совместная собственность супругов' },
  { value: '3', label: '3 — аренда' },
  { value: '4', label: '4 — лизинг' },
  { value: '5', label: '5 — безвозмездное пользование' },
]

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

  const pickupAddress = [order.from_city, order.from_city_address].filter(Boolean).join(', ')
  const unloadAddress = [order.to_city, order.to_city_address].filter(Boolean).join(', ')
  const pickupDatetime = [fmtDate(order.ready_date), order.ready_time].filter(Boolean).join(' ')

  // Масса одной строкой — как в бланке: «брутто 25 727,5 кг, нетто 24 000 кг».
  const massLine = useMemo(() => {
    const parts: string[] = []
    if (order.weight_gross != null) parts.push(`брутто ${order.weight_gross} кг`)
    if (order.weight_net != null) parts.push(`нетто ${order.weight_net} кг`)
    return parts.join(', ')
  }, [order.weight_gross, order.weight_net])

  // ── Состояние формы ──
  // Шапка
  const [tnDate, setTnDate] = useState('')
  const [tnNumber, setTnNumber] = useState('')
  const [copyNumber, setCopyNumber] = useState('1')
  // 1 / 1а
  const [shipperReq, setShipperReq] = useState('')
  const [shipperIsForwarder, setShipperIsForwarder] = useState(false)
  const [shipperPaymentBasis, setShipperPaymentBasis] = useState('')
  const [serviceCustomer, setServiceCustomer] = useState('')
  const [serviceContract, setServiceContract] = useState('')
  // 2
  const [consignee, setConsignee] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  // 3
  const [containerNumber, setContainerNumber] = useState('')
  const [cargoName, setCargoName] = useState('')
  const [placesCount, setPlacesCount] = useState('')
  const [placesUnit, setPlacesUnit] = useState('шт')
  const [packaging, setPackaging] = useState('')
  const [cargoMass, setCargoMass] = useState('')
  const [declaredValue, setDeclaredValue] = useState('')
  // 4
  const [docsDangerous, setDocsDangerous] = useState('')
  const [docsCertificates, setDocsCertificates] = useState('')
  const [docsShipping, setDocsShipping] = useState('')
  // 5
  const [routeField, setRouteField] = useState('')
  const [deadline, setDeadline] = useState('')
  const [forwardingContact, setForwardingContact] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [temperature, setTemperature] = useState('')
  const [seal, setSeal] = useState('')
  // 6
  const [carrierReqField, setCarrierReqField] = useState('')
  const [driverName, setDriverName] = useState('')
  // 7
  const [vehicleTypeBrand, setVehicleTypeBrand] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [ownershipType, setOwnershipType] = useState('1')
  const [ownershipDoc, setOwnershipDoc] = useState('')
  const [specialPermit, setSpecialPermit] = useState('')
  // 8
  const [loaderRequisites, setLoaderRequisites] = useState('')
  const [loadingPointOwner, setLoadingPointOwner] = useState('')
  const [pickupAddrField, setPickupAddrField] = useState('')
  const [pickupDtField, setPickupDtField] = useState('')
  const [massAtLoading, setMassAtLoading] = useState('')
  // 10
  const [unloadAddrField, setUnloadAddrField] = useState('')
  const [unloadDtField, setUnloadDtField] = useState('')
  // 12
  const [costNoVat, setCostNoVat] = useState('')
  const [costCalcOrder, setCostCalcOrder] = useState('')
  const [payerRequisites, setPayerRequisites] = useState('')

  // Реквизиты сторон с юр. адресом лежат в приватной user_private: вторая
  // сторона сделки прочитать их из браузера не может (RLS), поэтому префилл
  // отдаёт сервер.
  const prefill = useCallback(async () => {
    try {
      const res = await fetch(`/api/generate-tn?order_id=${order.id}`)
      if (!res.ok) return
      const d = await res.json()
      const shipper = String(d.shipper_requisites || '')
      const carrierReq = String(d.carrier_requisites || '')
      // Не затираем то, что пользователь уже успел ввести руками.
      if (shipper) {
        setShipperReq(v => v || shipper)
        setLoaderRequisites(v => v || shipper)
        setPayerRequisites(v => v || shipper)
      }
      if (carrierReq) setCarrierReqField(v => v || carrierReq)
    } catch {
      // Префилл — не критичный путь: поля просто останутся пустыми.
    }
  }, [order.id])

  // Автозаполнение при каждом открытии: дата ТН — СЕГОДНЯ (не дата создания заявки).
  useEffect(() => {
    if (!open) return
    setCopyMode(false)
    setTnDate(new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    setTnNumber(orderNumber)
    setCopyNumber('1')

    setShipperReq('')
    setShipperIsForwarder(false)
    setShipperPaymentBasis('')
    setServiceCustomer('')
    setServiceContract('')

    setConsignee('')
    setDeliveryAddress(unloadAddress)

    setContainerNumber('')
    setCargoName('')
    setPlacesCount('')
    setPlacesUnit('шт')
    setPackaging('')
    setCargoMass(massLine)
    setDeclaredValue('')

    setDocsDangerous('')
    setDocsCertificates('')
    setDocsShipping('')

    setRouteField(route)
    setDeadline(fmtDateTime(order.arrival_time))
    setForwardingContact('')
    setSpecialRequirements('')
    setTemperature('')
    setSeal('')

    // Реквизиты перевозчика: показываем то, что доступно из карточки, а сервер
    // в префилле дополнит юридическим адресом.
    setCarrierReqField(
      carrier
        ? [carrier.company_name || carrier.name, carrier.inn ? `ИНН ${carrier.inn}` : null]
            .filter(Boolean).join(', ')
        : ''
    )
    setDriverName(driverInfo?.driver_name ?? '')

    setVehicleTypeBrand(driverInfo?.vehicle_brand ?? '')
    setVehiclePlate(driverInfo?.vehicle_plate ?? '')
    setOwnershipType('1')
    setOwnershipDoc('')
    setSpecialPermit('')

    setLoaderRequisites('')
    setLoadingPointOwner('')
    setPickupAddrField(pickupAddress)
    setPickupDtField(pickupDatetime)
    setMassAtLoading(massLine)

    setUnloadAddrField(unloadAddress)
    setUnloadDtField(fmtDateTime(order.arrival_time))

    const cost = order.agreed_price ?? order.price
    setCostNoVat(cost != null ? String(cost) : '')
    setCostCalcOrder('')
    setPayerRequisites('')

    prefill()
  }, [open, order, route, carrier, driverInfo, pickupAddress, unloadAddress, pickupDatetime, orderNumber, massLine, prefill])

  // Стоимость с НДС и сумма налога считаются из «без НДС» и ставки заявки.
  const vatPercent = VAT_PERCENT[order.vat_type] ?? 0
  const { vatAmount, costWithVat } = useMemo(() => {
    const base = parseMoney(costNoVat)
    if (!base) return { vatAmount: '', costWithVat: '' }
    const tax = base * (vatPercent / 100)
    return { vatAmount: money(tax), costWithVat: money(base + tax) }
  }, [costNoVat, vatPercent])

  // В режиме копии редактируются только номер контейнера и дата.
  const locked = copyMode

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
          copy_number: copyNumber,

          shipper_requisites: shipperReq,
          shipper_is_forwarder: shipperIsForwarder,
          shipper_payment_basis: shipperPaymentBasis,
          service_customer_requisites: serviceCustomer,
          service_contract_requisites: serviceContract,

          consignee_requisites: consignee,
          delivery_address: deliveryAddress,

          container_number: containerNumber,
          cargo_name: cargoName,
          cargo_packaging: [
            [placesCount, placesCount ? placesUnit : ''].filter(Boolean).join(' '),
            packaging,
          ].filter(Boolean).join(', '),
          cargo_mass: cargoMass,
          declared_value: declaredValue,

          docs_dangerous: docsDangerous,
          docs_certificates: docsCertificates,
          docs_shipping: docsShipping,

          route: routeField,
          delivery_deadline: deadline,
          forwarding_contact: forwardingContact,
          special_requirements: specialRequirements,
          // Температурный режим — только для REF-контейнеров; ЗПУ печатается в той же ячейке бланка.
          temperature_and_seal: [
            isRef && temperature ? `температурный режим: ${temperature}` : '',
            seal ? `ЗПУ: ${seal}` : '',
          ].filter(Boolean).join('; '),

          carrier_requisites: carrierReqField,
          driver_name: driverName,

          vehicle_type_brand: vehicleTypeBrand,
          vehicle_plate: vehiclePlate,
          ownership_type: ownershipType,
          ownership_doc: ownershipDoc,
          special_permit: specialPermit,

          loader_requisites: loaderRequisites,
          loading_point_owner: loadingPointOwner,
          pickup_address: pickupAddrField,
          pickup_datetime: pickupDtField,
          mass_at_loading: massAtLoading,
          places_at_loading: [placesCount, placesCount ? placesUnit : ''].filter(Boolean).join(' '),
          packaging_at_loading: packaging,

          unload_address: unloadAddrField,
          unload_datetime: unloadDtField,
          mass_at_unloading: massAtLoading,

          cost_no_vat: costNoVat ? money(parseMoney(costNoVat)) : '',
          vat_rate: vatLabel(order.vat_type),
          vat_amount: vatAmount,
          cost_with_vat: costWithVat,
          cost_calc_order: costCalcOrder,
          // Первичный учётный документ составляют сами стороны сделки.
          economic_subject_carrier: carrierReqField,
          economic_subject_shipper: shipperReq,
          economic_basis_carrier: '',
          economic_basis_shipper: '',
          payer_requisites: payerRequisites,
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

      <p className="mb-4 text-[13px] text-ink-3">
        Бланк по Приложению № 4 к Правилам перевозок грузов автомобильным транспортом.
        Пустые поля печатаются линиями под запись от руки — фактические даты, оговорки и подписи
        проставляются на погрузке и выгрузке.
      </p>

      <div className="space-y-3.5">
        <FormSection no="1" title="Шапка">
          <div className="grid gap-3 sm:grid-cols-4">
            <Input label="Дата" value={tnDate} onChange={e => setTnDate(e.target.value)} />
            <Input label="Номер накладной" value={tnNumber} onChange={e => setTnNumber(e.target.value)} disabled={locked} />
            <Input label="Экземпляр №" value={copyNumber} onChange={e => setCopyNumber(e.target.value)} disabled={locked} />
            <Input label="Дата заказа" value={fmtDate(order.created_at)} disabled />
          </div>
        </FormSection>

        <FormSection no="1" title="Грузоотправитель">
          <Input
            label="Реквизиты грузоотправителя"
            placeholder="ООО «Ромашка», ИНН 7707083893, 198188, г. Санкт-Петербург, ул. Зайцева, д. 41"
            value={shipperReq}
            onChange={e => setShipperReq(e.target.value)}
            disabled={locked}
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={shipperIsForwarder}
              onChange={e => setShipperIsForwarder(e.target.checked)}
              disabled={locked}
              className="h-4 w-4 rounded border-hairline text-accent"
            />
            <span className="text-sm text-ink-2">Грузоотправитель является экспедитором</span>
          </label>
          <Input
            label="Основание расчётов иным лицом (при наличии)"
            value={shipperPaymentBasis}
            onChange={e => setShipperPaymentBasis(e.target.value)}
            disabled={locked}
          />
        </FormSection>

        <FormSection no="1а" title="Заказчик услуг по организации перевозки (при наличии)">
          <Input
            label="Реквизиты заказчика услуг"
            value={serviceCustomer}
            onChange={e => setServiceCustomer(e.target.value)}
            disabled={locked}
          />
          <Input
            label="Реквизиты договора на организацию перевозки"
            value={serviceContract}
            onChange={e => setServiceContract(e.target.value)}
            disabled={locked}
          />
        </FormSection>

        <FormSection no="2" title="Грузополучатель">
          <Input
            label="Реквизиты грузополучателя"
            placeholder="ООО «Лог-СЛ», ИНН 5040107398, МО, Раменский р-н, с. Софьино"
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
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Номера контейнера в заявке нет (там только тип) — вводится вручную.
                В режиме копии это одно из двух редактируемых полей. */}
            <Input
              label="Контейнер №"
              placeholder="DLRU0087364"
              value={containerNumber}
              onChange={e => setContainerNumber(e.target.value)}
            />
            <Input
              label="Наименование груза"
              placeholder="Товары народного потребления"
              value={cargoName}
              onChange={e => setCargoName(e.target.value)}
              disabled={locked}
            />
          </div>
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
            <Input
              label="Маркировка, тара, упаковка"
              placeholder="паллеты, стрейч-плёнка"
              value={packaging}
              onChange={e => setPackaging(e.target.value)}
              disabled={locked}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Масса брутто / нетто, объём"
              placeholder="брутто 25727.5 кг, нетто 24000 кг"
              value={cargoMass}
              onChange={e => setCargoMass(e.target.value)}
              disabled={locked}
            />
            <Input
              label="Объявленная стоимость (при необходимости)"
              value={declaredValue}
              onChange={e => setDeclaredValue(e.target.value)}
              disabled={locked}
            />
          </div>
        </FormSection>

        <FormSection no="4" title="Сопроводительные документы (при наличии)">
          <Input
            label="Документы по ДОПОГ, санитарные, таможенные, карантинные"
            value={docsDangerous}
            onChange={e => setDocsDangerous(e.target.value)}
            disabled={locked}
          />
          <Input
            label="Сертификаты, паспорта качества, удостоверения"
            value={docsCertificates}
            onChange={e => setDocsCertificates(e.target.value)}
            disabled={locked}
          />
          <Input
            label="Документы об отгрузке, сопроводительная ведомость"
            value={docsShipping}
            onChange={e => setDocsShipping(e.target.value)}
            disabled={locked}
          />
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
          <Input
            label="Фитосанитарные, таможенные и прочие требования"
            value={specialRequirements}
            onChange={e => setSpecialRequirements(e.target.value)}
            disabled={locked}
          />
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
              label="Тип, марка, грузоподъёмность"
              placeholder="Ситрак, 20 т"
              value={vehicleTypeBrand}
              onChange={e => setVehicleTypeBrand(e.target.value)}
              disabled={locked}
            />
            <Input
              label="Регистрационный номер ТС"
              placeholder="О889РВ790"
              value={vehiclePlate}
              onChange={e => setVehiclePlate(e.target.value)}
              disabled={locked}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Тип владения
              </label>
              <select
                value={ownershipType}
                onChange={e => setOwnershipType(e.target.value)}
                disabled={locked}
                className="h-11 w-full rounded-field border border-hairline bg-surface px-2 text-[15px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:bg-surface-sunken disabled:text-ink-4"
              >
                {OWNERSHIP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {/* Документ основания владения обязателен только для аренды, лизинга и безвозмездного пользования */}
            {['3', '4', '5'].includes(ownershipType) && (
              <Input
                label="Документ, подтверждающий владение"
                placeholder="Договор аренды № 12 от 01.03.2026"
                value={ownershipDoc}
                onChange={e => setOwnershipDoc(e.target.value)}
                disabled={locked}
              />
            )}
          </div>
          <Input
            label="Специальное разрешение (при наличии)"
            value={specialPermit}
            onChange={e => setSpecialPermit(e.target.value)}
            disabled={locked}
          />
        </FormSection>

        <FormSection no="8" title="Приём груза">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Реквизиты лица, осуществляющего погрузку"
              value={loaderRequisites}
              onChange={e => setLoaderRequisites(e.target.value)}
              disabled={locked}
            />
            <Input
              label="Владелец объекта инфраструктуры пункта погрузки"
              placeholder="ООО «Терминал», ИНН 7707083893"
              value={loadingPointOwner}
              onChange={e => setLoadingPointOwner(e.target.value)}
              disabled={locked}
            />
          </div>
          <Input label="Адрес места погрузки" value={pickupAddrField} onChange={e => setPickupAddrField(e.target.value)} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Заявленные дата и время подачи" value={pickupDtField} onChange={e => setPickupDtField(e.target.value)} disabled={locked} />
            <Input
              label="Масса брутто и метод определения"
              placeholder="25727.5 кг, взвешивание"
              value={massAtLoading}
              onChange={e => setMassAtLoading(e.target.value)}
              disabled={locked}
            />
          </div>
        </FormSection>

        <FormSection no="10" title="Выдача груза">
          <Input label="Адрес места выгрузки" value={unloadAddrField} onChange={e => setUnloadAddrField(e.target.value)} disabled={locked} />
          <Input label="Заявленные дата и время подачи под выгрузку" value={unloadDtField} onChange={e => setUnloadDtField(e.target.value)} disabled={locked} />
        </FormSection>

        <FormSection no="12" title="Стоимость перевозки">
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              label="Без налога, ₽"
              value={costNoVat}
              onChange={e => setCostNoVat(e.target.value)}
              disabled={locked}
              className="font-mono tabular-nums"
            />
            <Input label="Налоговая ставка" value={vatLabel(order.vat_type)} disabled />
            <Input label="Сумма налога, ₽" value={vatAmount} disabled className="font-mono tabular-nums" />
            <Input label="С налогом, ₽" value={costWithVat} disabled className="font-mono tabular-nums" />
          </div>
          <Input
            label="Порядок расчёта платы (при наличии)"
            value={costCalcOrder}
            onChange={e => setCostCalcOrder(e.target.value)}
            disabled={locked}
          />
          <Input
            label="Плательщик (от кого поступают денежные средства)"
            value={payerRequisites}
            onChange={e => setPayerRequisites(e.target.value)}
            disabled={locked}
          />
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
