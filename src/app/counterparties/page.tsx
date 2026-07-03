'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Counterparty } from '@/types/database'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { Plus, Trash2, Search, X, Truck, Package } from 'lucide-react'
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
    // Экранируем спецсимволы PostgREST-фильтра (,()\) чтобы значение поиска
    // нельзя было использовать для инъекции дополнительных условий в .or()
    const term = searchEmail.trim().replace(/[(),\\]/g, ' ').trim()
    if (!term) return
    setSearching(true)
    setSearchResult(null)
    const supabase = createClient()
    // Ищем по имени компании или имени пользователя
    const { data } = await supabase
      .from('users')
      .select('id, name, company_name, role, city, inn')
      .or(`company_name.ilike.%${term}%,name.ilike.%${term}%`)
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
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Контрагенты</h1>
            <p className="text-[13px] text-ink-3 mt-0.5">Ваши проверенные {targetRole}</p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} className="mr-1" />
            Добавить
          </Button>
        </div>

        {/* Блок добавления */}
        {addOpen && (
          <div className="bg-surface rounded-card border border-hairline p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-ink-3">Добавить контрагента</h2>
              <button onClick={() => { setAddOpen(false); setSearchResult(null); setSearchEmail('') }} className="p-1.5 rounded-field text-ink-4 hover:text-ink hover:bg-surface-sunken transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                <input
                  type="text"
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  placeholder="Имя или название компании..."
                  className="w-full h-11 pl-9 pr-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
                />
              </div>
              <Button variant="secondary" onClick={searchUser} loading={searching}>
                Найти
              </Button>
            </div>

            {searchResult && (
              <div className="p-4 rounded-card bg-surface-sunken border border-hairline mb-1">
                <div className="font-semibold text-ink">{searchResult.company_name || searchResult.name || 'Без имени'}</div>
                <div className="inline-flex items-center gap-1.5 mt-1 mb-3 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
                  {searchResult.role === 'carrier'
                    ? <><Truck size={13} strokeWidth={1.5} className="text-ink-3" /> Перевозчик</>
                    : <><Package size={13} strokeWidth={1.5} className="text-ink-3" /> Клиент</>}
                </div>
                <div className="mb-3">
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Заметка (необязательно)"
                    className="w-full h-11 px-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
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
          <div className="border border-hairline rounded-card bg-surface overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[110px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
            ))}
          </div>
        ) : counterparties.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6 text-ink-3">
            <ContainerMark size={28} className="text-ink-4" />
            <p className="text-ink-2">Контрагентов пока нет</p>
            <p className="text-[13px] max-w-xs">Добавьте проверенных {targetRole} для быстрого взаимодействия</p>
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover transition-colors">
              <Plus size={15} />
              Добавить контрагента
            </button>
          </div>
        ) : (
          <div className="border border-hairline rounded-card bg-surface overflow-hidden">
            {counterparties.map(cp => {
              const partner = cp.counterparty
              const partnerInn = (partner as { inn?: string | null })?.inn
              return (
                <div key={cp.id} className="flex items-center justify-between gap-3 min-h-[56px] py-3 px-5 border-b border-hairline last:border-0 transition-colors ease-terminal hover:bg-accent-soft">
                  <div className="flex items-center gap-3 min-w-0">
                    <ContainerMark size={20} className="text-ink-3 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate">
                        {partner?.company_name || partner?.name || 'Без имени'}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
                          {partner?.role === 'carrier'
                            ? <><Truck size={12} strokeWidth={1.5} /> Перевозчик</>
                            : <><Package size={12} strokeWidth={1.5} /> Клиент</>}
                        </span>
                        {(partner as { city?: string | null })?.city && (
                          <span className="text-[13px] text-ink-3">· {(partner as { city?: string | null }).city}</span>
                        )}
                        {partnerInn && (
                          <span className="font-mono text-[13px] tabular-nums text-ink-3">ИНН {partnerInn}</span>
                        )}
                      </div>
                      {cp.note && <div className="text-[13px] text-accent mt-0.5">{cp.note}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => removeCounterparty(cp.id)}
                    disabled={deletingId === cp.id}
                    className="p-2 rounded-field text-ink-4 hover:bg-danger-soft hover:text-danger transition-colors shrink-0 disabled:opacity-50"
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
        <div className="mt-6 p-4 rounded-card bg-surface border border-hairline">
          <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2">Как это работает</div>
          <ul className="space-y-1.5 text-[13px] text-ink-2">
            {user?.role === 'client' ? (
              <>
                <li className="flex gap-2"><span className="text-accent">—</span> При создании заявки выберите «Только для моих контрагентов»</li>
                <li className="flex gap-2"><span className="text-accent">—</span> Такие заявки видны только добавленным перевозчикам</li>
                <li className="flex gap-2"><span className="text-accent">—</span> Они выделяются акцентной рамкой в ленте перевозчика</li>
              </>
            ) : (
              <>
                <li className="flex gap-2"><span className="text-accent">—</span> Заявки клиентов из вашего списка выделяются акцентной рамкой</li>
                <li className="flex gap-2"><span className="text-accent">—</span> Вы получаете уведомление, когда они публикуют новую заявку</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </AppLayout>
  )
}
