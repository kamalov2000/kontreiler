'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MoreVertical, X, Edit2, Copy, RotateCcw, Route as RouteIcon } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { RouteInline } from '@/components/ui/RouteInline'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck, TruckContainerType } from '@/types/database'
import { formatDate, formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'

export default function MyTrucksPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null)

  // Edit modal
  const [editTruck, setEditTruck] = useState<Truck | null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [editContainer, setEditContainer] = useState<TruckContainerType>('20ft')
  const [editDate, setEditDate] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editNegotiable, setEditNegotiable] = useState(false)
  const [editPayload, setEditPayload] = useState('')
  const [editTrailerType, setEditTrailerType] = useState('')
  const [editLongDistance, setEditLongDistance] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (userLoading) return
    if (!user) { setLoading(false); return }
    async function fetch() {
      const supabase = createClient()
      const { data } = await supabase
        .from('trucks')
        .select('*')
        .eq('carrier_id', user!.id)
        .order('created_at', { ascending: false })

      setTrucks((data || []) as Truck[])
      setLoading(false)
    }
    fetch()
  }, [user, userLoading])

  async function closeTruck(id: string) {
    setClosingId(id)
    const supabase = createClient()
    await supabase.from('trucks').update({ status: 'closed' }).eq('id', id)
    setTrucks(prev => prev.map(t => t.id === id ? { ...t, status: 'closed' } : t))
    toast.success('Рейс закрыт')
    setClosingId(null)
  }

  async function changeTruckStatus(id: string, newStatus: 'busy' | 'done') {
    setStatusChangingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('trucks').update({ status: newStatus }).eq('id', id)
    if (error) {
      toast.error('Ошибка при обновлении статуса')
    } else {
      setTrucks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
      toast.success(newStatus === 'busy' ? 'Статус: Занята' : 'Статус: Рейс выполнен')
    }
    setStatusChangingId(null)
  }

  async function revertTruckStatus(id: string) {
    setStatusChangingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('trucks').update({ status: 'active' }).eq('id', id)
    if (error) {
      toast.error('Ошибка при откате статуса')
    } else {
      setTrucks(prev => prev.map(t => t.id === id ? { ...t, status: 'active' } : t))
      toast.success('Статус сброшен в "Свободна"')
    }
    setStatusChangingId(null)
  }

  function openEdit(truck: Truck) {
    setEditTruck(truck)
    setEditFrom(truck.from_city)
    setEditTo(truck.to_city)
    setEditContainer(truck.container_type as TruckContainerType)
    setEditDate(truck.available_date)
    setEditPrice(truck.price ? String(truck.price) : '')
    setEditNegotiable(truck.is_negotiable)
    setEditPayload(truck.payload ? String(truck.payload) : '')
    setEditTrailerType(truck.trailer_type || '')
    setEditLongDistance(truck.long_distance ?? false)
  }

  async function saveEdit() {
    if (!editTruck) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('trucks')
      .update({
        from_city: editFrom,
        to_city: editTo,
        container_type: editContainer,
        available_date: editDate,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable,
        payload: editPayload ? parseInt(editPayload) : null,
        trailer_type: editTrailerType || null,
        long_distance: editLongDistance,
      })
      .eq('id', editTruck.id)

    if (error) {
      toast.error('Ошибка при сохранении')
    } else {
      toast.success('Машина обновлена')
      setTrucks(prev => prev.map(t => t.id === editTruck.id ? {
        ...t,
        from_city: editFrom,
        to_city: editTo,
        container_type: editContainer,
        available_date: editDate,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable,
        payload: editPayload ? parseInt(editPayload) : null,
        trailer_type: editTrailerType || null,
        long_distance: editLongDistance,
      } : t))
      setEditTruck(null)
    }
    setSaving(false)
  }

  function duplicateTruck(truck: Truck) {
    const qs = new URLSearchParams({
      from: truck.from_city,
      to: truck.to_city,
      container: truck.container_type,
      date: truck.available_date,
      ...(truck.price ? { price: String(truck.price) } : {}),
      ...(truck.is_negotiable ? { negotiable: '1' } : {}),
      ...(truck.payload ? { payload: String(truck.payload) } : {}),
      ...(truck.trailer_type ? { trailer: truck.trailer_type } : {}),
      ...(truck.long_distance ? { long: '1' } : {}),
      ...(truck.notes ? { notes: truck.notes } : {}),
    })
    router.push(`/trucks/new?${qs}`)
  }

  const active  = trucks.filter(t => t.status === 'active')
  const busy    = trucks.filter(t => t.status === 'busy')
  const done    = trucks.filter(t => t.status === 'done')
  const closed  = trucks.filter(t => t.status === 'closed')

  const today = new Date().toISOString().split('T')[0]

  const sections: {
    key: string
    label: string
    items: Truck[]
    onClose?: (id: string) => void
    onChangeStatus?: (id: string, status: 'busy' | 'done') => void
    onRevert?: (id: string) => void
    onEdit?: (truck: Truck) => void
    dim?: string
  }[] = [
    { key: 'active', label: 'Свободные', items: active, onClose: closeTruck, onChangeStatus: changeTruckStatus, onEdit: openEdit },
    { key: 'busy',   label: 'Занятые',   items: busy,   onChangeStatus: changeTruckStatus, onRevert: revertTruckStatus, onEdit: openEdit },
    { key: 'done',   label: 'Выполненные', items: done, onRevert: revertTruckStatus, dim: 'opacity-80' },
    { key: 'closed', label: 'Закрытые',  items: closed, dim: 'opacity-60' },
  ]

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Мои машины</h1>
        <Link href="/trucks/new">
          <Button size="md">
            <Plus size={16} className="mr-1" />
            Разместить
          </Button>
        </Link>
      </div>

      {/* Статистика */}
      {!loading && trucks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-hairline rounded-card bg-surface overflow-hidden mb-5">
          {[
            { label: 'Свободные',   value: active.length, color: 'text-accent' },
            { label: 'Занятые',     value: busy.length,   color: 'text-warning' },
            { label: 'Выполненные', value: done.length,   color: 'text-success' },
            { label: 'Закрытые',    value: closed.length, color: 'text-ink-3' },
          ].map((s, i) => (
            <div
              key={s.label}
              className={[
                'flex flex-col gap-1 px-5 py-4',
                i < 3 ? 'sm:border-r border-hairline' : '',
                i % 2 === 0 ? 'border-r sm:border-r' : '',
                i < 2 ? 'border-b sm:border-b-0' : '',
              ].join(' ')}
            >
              <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">{s.label}</span>
              <span className={`font-mono text-2xl font-medium tabular-nums ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="border border-hairline rounded-card bg-surface overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
              <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              <span className="w-[104px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              <span className="w-[110px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
            </div>
          ))}
        </div>
      ) : trucks.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6 text-ink-3">
          <ContainerMark size={28} className="text-ink-4" />
          <p className="text-[15px] max-w-[320px]">Вы ещё не размещали машины на доске.</p>
          <Link href="/trucks/new">
            <Button>Добавить машину</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.filter(s => s.items.length > 0).map(section => (
            <section key={section.key}>
              <h2 className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2.5">
                {section.label}
                <span className="font-mono text-[11px] tabular-nums text-ink-4">{section.items.length}</span>
              </h2>
              <div className={`border border-hairline rounded-card bg-surface overflow-hidden ${section.dim ?? ''}`}>
                {section.items.map(truck => (
                  <TruckRow
                    key={truck.id}
                    truck={truck}
                    onClose={section.onClose}
                    closing={closingId === truck.id}
                    onChangeStatus={section.onChangeStatus}
                    statusChanging={statusChangingId === truck.id}
                    onRevert={section.onRevert}
                    onEdit={section.onEdit}
                    onDuplicate={duplicateTruck}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editTruck && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-modal shadow-overlay w-full max-w-lg max-h-[90vh] overflow-y-auto border border-hairline">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <h2 className="text-lg font-semibold text-ink">Редактировать машину</h2>
              <button
                onClick={() => setEditTruck(null)}
                className="p-1.5 rounded-field text-ink-4 hover:bg-surface-sunken hover:text-ink-2 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CityAutocomplete
                  label="Откуда"
                  value={editFrom}
                  onChange={setEditFrom}
                  placeholder="Город отправления"
                />
                <CityAutocomplete
                  label="Куда"
                  value={editTo}
                  onChange={setEditTo}
                  placeholder="Город назначения"
                />
              </div>
              <Select
                label="Тип контейнера"
                value={editContainer}
                onChange={e => setEditContainer(e.target.value as TruckContainerType)}
                options={TRUCK_CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              />
              <Select
                label="Тип прицепа / платформы"
                value={editTrailerType}
                onChange={e => setEditTrailerType(e.target.value)}
                options={TRAILER_TYPES.map(t => ({ value: t.value, label: t.label }))}
                placeholder="Не указан"
              />
              <Input
                label="Грузоподъёмность (тонн)"
                type="number"
                value={editPayload}
                onChange={e => setEditPayload(e.target.value)}
                placeholder="Например: 22"
                min="1"
                max="100"
              />
              <Input
                label="Дата готовности"
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                min={today}
              />
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-card border border-hairline hover:border-border-strong transition-colors">
                <input
                  type="checkbox"
                  checked={editLongDistance}
                  onChange={e => setEditLongDistance(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline text-accent"
                />
                <div>
                  <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                    <RouteIcon size={14} className="text-ink-3" />
                    Готов к дальним рейсам
                  </div>
                  <div className="text-xs text-ink-3">Межрегиональные и дальние маршруты</div>
                </div>
              </label>
              <div>
                <label className="block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2">Ставка</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editNegotiable}
                    onChange={e => { setEditNegotiable(e.target.checked); if (e.target.checked) setEditPrice('') }}
                    className="w-4 h-4 rounded border-hairline text-accent"
                  />
                  <span className="text-sm text-ink-2">Договорная</span>
                </label>
                {!editNegotiable && (
                  <Input
                    type="number"
                    placeholder="Ставка в рублях"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    min="0"
                  />
                )}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-hairline">
              <Button onClick={saveEdit} loading={saving} className="flex-1">
                Сохранить
              </Button>
              <Button variant="secondary" onClick={() => setEditTruck(null)}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function TruckRow({
  truck,
  onClose,
  closing,
  onChangeStatus,
  statusChanging,
  onRevert,
  onEdit,
  onDuplicate,
}: {
  truck: Truck
  onClose?: (id: string) => void
  closing?: boolean
  onChangeStatus?: (id: string, status: 'busy' | 'done') => void
  statusChanging?: boolean
  onRevert?: (id: string) => void
  onEdit?: (truck: Truck) => void
  onDuplicate?: (truck: Truck) => void
}) {
  const containerLabel = TRUCK_CONTAINER_TYPES.find(c => c.value === truck.container_type)?.label || truck.container_type
  const trailerLabel = truck.trailer_type
    ? (TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type)
    : null
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const canEdit   = truck.status === 'active' && !!onEdit
  const canRevert = (truck.status === 'busy' || truck.status === 'done') && !!onRevert
  const hasActions = truck.status === 'active' || truck.status === 'busy'

  return (
    <div className="border-b border-hairline last:border-0 px-5 py-3">
      <div className="flex items-start gap-3.5">
        <div className="flex-1 min-w-0">
          {/* Маршрут + статус */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <RouteInline from={truck.from_city} to={truck.to_city} />
            <StatusPill status={truck.status} kind="truck" className="flex-none" />
          </div>

          {/* Мета-строка: контейнер · цена · дата · доп. теги */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ContainerChip label={containerLabel} />
            <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
              {formatPrice(truck.price, truck.is_negotiable)}
            </span>
            <span className="font-mono text-[13px] tabular-nums text-ink-3">
              готов {formatDate(truck.available_date)}
            </span>
            {trailerLabel && (
              <span className="font-mono text-[11px] font-medium uppercase px-1.5 py-0.5 rounded-field border border-hairline bg-surface-sunken text-ink-2">
                {trailerLabel}
              </span>
            )}
            {truck.payload && (
              <span className="font-mono text-[11px] font-medium uppercase px-1.5 py-0.5 rounded-field border border-hairline bg-surface-sunken text-ink-2">
                до {truck.payload} т
              </span>
            )}
            {truck.long_distance && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase px-1.5 py-0.5 rounded-field border border-success bg-success-soft text-success">
                <RouteIcon size={11} />
                Дальние рейсы
              </span>
            )}
          </div>
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-field text-ink-3 hover:bg-surface-sunken hover:text-ink transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-hairline rounded-card shadow-overlay z-50 overflow-hidden">
              {canEdit && (
                <button
                  onClick={() => { onEdit!(truck); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-sunken transition-colors"
                >
                  <Edit2 size={14} className="text-ink-4" />
                  Редактировать
                </button>
              )}
              {onDuplicate && (
                <button
                  onClick={() => { onDuplicate(truck); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-sunken transition-colors"
                >
                  <Copy size={14} className="text-ink-4" />
                  Дублировать
                </button>
              )}
              {canRevert && (
                <button
                  onClick={() => { onRevert!(truck.id); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-warning hover:bg-warning-soft transition-colors"
                >
                  <RotateCcw size={14} className="text-warning" />
                  {truck.status === 'done' ? 'Переоткрыть рейс' : 'Вернуть в «Свободна»'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forward status buttons */}
      {hasActions && (
        <div className="mt-3 pt-3 border-t border-hairline flex gap-2 flex-wrap">
          {truck.status === 'active' && (
            <Link href={`/trucks/${truck.id}`}>
              <Button size="sm" variant="secondary">
                Отклики
              </Button>
            </Link>
          )}
          {truck.status === 'active' && onChangeStatus && (
            <Button
              size="sm"
              loading={statusChanging}
              onClick={() => onChangeStatus(truck.id, 'busy')}
            >
              Занята
            </Button>
          )}
          {truck.status === 'busy' && onChangeStatus && (
            <Button
              size="sm"
              loading={statusChanging}
              onClick={() => onChangeStatus(truck.id, 'done')}
            >
              Рейс выполнен
            </Button>
          )}
          {truck.status === 'active' && onClose && (
            <Button
              variant="danger"
              size="sm"
              loading={closing}
              onClick={() => onClose(truck.id)}
            >
              Закрыть
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
