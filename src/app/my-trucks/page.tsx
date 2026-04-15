'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Plus, MoreVertical, X, Edit2, Copy, RotateCcw } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Truck, TruckContainerType } from '@/types/database'
import { formatDate, formatPrice } from '@/lib/utils'
import { TRUCK_CONTAINER_TYPES, TRAILER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { TRUCK_STATUS_LABEL, TRUCK_STATUS_CLASS } from '@/lib/status'

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

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Мои машины</h1>
          <Link href="/trucks/new">
            <Button size="sm">
              <Plus size={16} className="mr-1" /> Разместить
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : trucks.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-4">Вы ещё не размещали машины</p>
            <Link href="/trucks/new" className="text-blue-600 hover:underline text-sm">
              Разместить первую →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Свободные ({active.length})
                </h2>
                <div className="space-y-3">
                  {active.map(truck => (
                    <TruckCard
                      key={truck.id}
                      truck={truck}
                      onClose={closeTruck}
                      closing={closingId === truck.id}
                      onChangeStatus={changeTruckStatus}
                      statusChanging={statusChangingId === truck.id}
                      onEdit={openEdit}
                      onDuplicate={duplicateTruck}
                    />
                  ))}
                </div>
              </section>
            )}
            {busy.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Занятые ({busy.length})
                </h2>
                <div className="space-y-3">
                  {busy.map(truck => (
                    <TruckCard
                      key={truck.id}
                      truck={truck}
                      onChangeStatus={changeTruckStatus}
                      statusChanging={statusChangingId === truck.id}
                      onRevert={revertTruckStatus}
                      onEdit={openEdit}
                      onDuplicate={duplicateTruck}
                    />
                  ))}
                </div>
              </section>
            )}
            {done.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Выполненные ({done.length})
                </h2>
                <div className="space-y-3 opacity-80">
                  {done.map(truck => (
                    <TruckCard
                      key={truck.id}
                      truck={truck}
                      onRevert={revertTruckStatus}
                      statusChanging={statusChangingId === truck.id}
                      onDuplicate={duplicateTruck}
                    />
                  ))}
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Закрытые ({closed.length})
                </h2>
                <div className="space-y-3 opacity-60">
                  {closed.map(truck => (
                    <TruckCard
                      key={truck.id}
                      truck={truck}
                      onDuplicate={duplicateTruck}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editTruck && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Редактировать машину</h2>
              <button
                onClick={() => setEditTruck(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
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
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={editLongDistance}
                  onChange={e => setEditLongDistance(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">🛣️ Готов к дальним рейсам</div>
                  <div className="text-xs text-gray-500">Межрегиональные и дальние маршруты</div>
                </div>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ставка</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editNegotiable}
                    onChange={e => { setEditNegotiable(e.target.checked); if (e.target.checked) setEditPrice('') }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Договорная</span>
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
            <div className="flex gap-3 p-5 border-t border-gray-100">
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

function TruckCard({
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

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold text-gray-900">{truck.from_city}</span>
            <ArrowRight size={14} className="text-gray-400 shrink-0" />
            <span className="font-bold text-gray-900">{truck.to_city}</span>
            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${TRUCK_STATUS_CLASS[truck.status]}`}>
              {TRUCK_STATUS_LABEL[truck.status] ?? truck.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">{containerLabel}</span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium">
              {formatPrice(truck.price, truck.is_negotiable)}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600">
              Готов: {formatDate(truck.available_date)}
            </span>
            {truck.trailer_type && (
              <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-100">
                {TRAILER_TYPES.find(t => t.value === truck.trailer_type)?.label || truck.trailer_type}
              </span>
            )}
            {truck.payload && (
              <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-100">
                до {truck.payload} т
              </span>
            )}
            {truck.long_distance && (
              <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                🛣️ Дальние рейсы
              </span>
            )}
          </div>
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {canEdit && (
                <button
                  onClick={() => { onEdit!(truck); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 size={14} className="text-gray-400" />
                  Редактировать
                </button>
              )}
              {onDuplicate && (
                <button
                  onClick={() => { onDuplicate(truck); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Copy size={14} className="text-gray-400" />
                  Дублировать
                </button>
              )}
              {canRevert && (
                <button
                  onClick={() => { onRevert!(truck.id); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  <RotateCcw size={14} className="text-amber-500" />
                  {truck.status === 'done' ? 'Переоткрыть рейс' : '← Вернуть в "Свободна"'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forward status buttons */}
      {(truck.status === 'active' || truck.status === 'busy') && (
        <div className="mt-3 pt-3 border-t border-gray-50 flex gap-2 flex-wrap">
          {truck.status === 'active' && (
            <Link
              href={`/trucks/${truck.id}`}
              className="flex-1 text-center px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              Отклики
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
