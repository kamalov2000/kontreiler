'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Counterparty } from '@/types/database'
import { Users, Plus, Trash2, Search, X } from 'lucide-react'
import { toast } from 'sonner'

export default function CounterpartiesPage() {
  const { user, loading: userLoading } = useUser()
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<{ id: string; name: string | null; company_name: string | null; role: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (userLoading || !user) return
    fetchCounterparties()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userLoading])

  async function fetchCounterparties() {
    const supabase = createClient()
    const { data } = await supabase
      .from('counterparties')
      .select('*, counterparty:users!counterparty_id(id, name, company_name, role, city, inn)')
      .eq('owner_id', user!.id)
      .order('created_at', { ascending: false })
    setCounterparties((data || []) as Counterparty[])
    setLoading(false)
  }

  async function searchUser() {
    if (!searchEmail.trim()) return
    setSearching(true)
    setSearchResult(null)
    const supabase = createClient()
    // Ищем по email через auth (нам доступен только users table по условию)
    // Ищем по имени компании или имени пользователя
    const { data } = await supabase
      .from('users')
      .select('id, name, company_name, role, city, inn')
      .or(`company_name.ilike.%${searchEmail}%,name.ilike.%${searchEmail}%`)
      .neq('id', user!.id)
      .limit(5)
    setSearching(false)
    if (!data || data.length === 0) {
      toast.error('Пользователь не найден')
      return
    }
    // Show results as list
    setSearchResult(data[0] as { id: string; name: string | null; company_name: string | null; role: string })
  }

  async function addCounterparty(cpId: string) {
    setAdding(true)
    const supabase = createClient()
    const { error } = await supabase.from('counterparties').insert({
      owner_id: user!.id,
      counterparty_id: cpId,
      note: note.trim() || null,
    })
    setAdding(false)
    if (error) {
      if (error.code === '23505') toast.error('Уже добавлен в контрагенты')
      else toast.error('Ошибка при добавлении')
    } else {
      toast.success('Контрагент добавлен!')
      setAddOpen(false)
      setSearchEmail('')
      setSearchResult(null)
      setNote('')
      fetchCounterparties()
    }
  }

  async function removeCounterparty(id: string) {
    setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('counterparties').delete().eq('id', id)
    setDeletingId(null)
    if (error) toast.error('Ошибка при удалении')
    else {
      toast.success('Контрагент удалён')
      setCounterparties(prev => prev.filter(c => c.id !== id))
    }
  }

  const targetRole = user?.role === 'client' ? 'перевозчиков' : 'клиентов'

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Контрагенты</h1>
              <p className="text-sm text-gray-500">Ваши проверенные {targetRole}</p>
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} className="mr-1" />
            Добавить
          </Button>
        </div>

        {/* Блок добавления */}
        {addOpen && (
          <div className="bg-white rounded-2xl border border-blue-200 p-5 mb-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Добавить контрагента</h2>
              <button onClick={() => { setAddOpen(false); setSearchResult(null); setSearchEmail('') }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  placeholder="Имя или название компании..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button variant="secondary" onClick={searchUser} loading={searching}>
                Найти
              </Button>
            </div>

            {searchResult && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 mb-3">
                <div className="font-medium text-gray-900">{searchResult.company_name || searchResult.name || 'Без имени'}</div>
                <div className="text-xs text-gray-500 mb-2">{searchResult.role === 'carrier' ? 'Перевозчик' : 'Клиент'}</div>
                <div className="mb-2">
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Заметка (необязательно)"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button size="sm" onClick={() => addCounterparty(searchResult.id)} loading={adding}>
                  Добавить в контрагенты
                </Button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : counterparties.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={48} className="mx-auto mb-3 opacity-20" />
            <p className="mb-1">Контрагентов пока нет</p>
            <p className="text-sm">Добавьте проверенных {targetRole} для быстрого взаимодействия</p>
          </div>
        ) : (
          <div className="space-y-3">
            {counterparties.map(cp => {
              const partner = cp.counterparty
              return (
                <div key={cp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Users size={18} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {partner?.company_name || partner?.name || 'Без имени'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {partner?.role === 'carrier' ? '🚛 Перевозчик' : '📦 Клиент'}
                        {(partner as { city?: string | null })?.city ? ` · ${(partner as { city?: string | null }).city}` : ''}
                      </div>
                      {cp.note && <div className="text-xs text-blue-600 mt-0.5 italic">{cp.note}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => removeCounterparty(cp.id)}
                    disabled={deletingId === cp.id}
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
                    title="Удалить контрагента"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Инфо-блок */}
        <div className="mt-6 p-4 rounded-2xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
          <strong>Как это работает:</strong>
          <ul className="mt-1 space-y-1 text-blue-600">
            {user?.role === 'client' ? (
              <>
                <li>• При создании заявки выберите «Только для моих контрагентов»</li>
                <li>• Такие заявки видны только добавленным перевозчикам</li>
                <li>• Они выделяются зелёной рамкой в ленте перевозчика</li>
              </>
            ) : (
              <>
                <li>• Заявки клиентов из вашего списка выделяются зелёной рамкой</li>
                <li>• Вы получаете уведомление, когда они публикуют новую заявку</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </AppLayout>
  )
}
