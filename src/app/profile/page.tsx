'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { createClient } from '@/lib/supabase/client'
import { SavedRoute, Review, CompanyMember } from '@/types/database'
import { toast } from 'sonner'
import { normalizePhone, formatDateTime } from '@/lib/utils'
import {
  User, Shield, CheckCircle, Trash2, Plus, MapPin, Star, Mail,
  Users, Building2, Search, ChevronDown, ChevronUp,
} from 'lucide-react'
import { CONTAINER_TYPES } from '@/lib/cities'
import { RatingBadge } from '@/components/ui/RatingBadge'

export default function ProfilePage() {
  const { user, isEmailVerified, loading } = useUser()
  const { t } = useLanguage()

  // Base fields
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')

  // Company basics
  const [companyName, setCompanyName] = useState('')
  const [inn, setInn] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')

  // Extended company profile
  const [kpp, setKpp] = useState('')
  const [ogrn, setOgrn] = useState('')
  const [legalAddress, setLegalAddress] = useState('')
  const [actualAddress, setActualAddress] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankCorrAccount, setBankCorrAccount] = useState('')
  const [bankBik, setBankBik] = useState('')
  const [signatoryName, setSignatoryName] = useState('')
  const [signatoryPosition, setSignatoryPosition] = useState('')
  const [signatoryBasis, setSignatoryBasis] = useState('')
  const [defaultObligations, setDefaultObligations] = useState('')

  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [extOpen, setExtOpen] = useState(false)

  // Saved routes
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [routeContainer, setRouteContainer] = useState('')
  const [addingRoute, setAddingRoute] = useState(false)

  // Ratings & reviews
  const [myRating, setMyRating] = useState<{ avg: number; count: number } | null>(null)
  const [myReviews, setMyReviews] = useState<(Review & { reviewer?: { name: string | null } })[]>([])

  // Company members
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [memberName, setMemberName] = useState('')
  const [memberPosition, setMemberPosition] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone || '')
      setCity(user.city || '')
      setCompanyName(user.company_name || '')
      setInn(user.inn || '')
      setLicenseNumber(user.license_number || '')
      setKpp(user.kpp || '')
      setOgrn(user.ogrn || '')
      setLegalAddress(user.legal_address || '')
      setActualAddress(user.actual_address || '')
      setBankName(user.bank_name || '')
      setBankAccount(user.bank_account || '')
      setBankCorrAccount(user.bank_corr_account || '')
      setBankBik(user.bank_bik || '')
      setSignatoryName(user.signatory_name || '')
      setSignatoryPosition(user.signatory_position || '')
      setSignatoryBasis(user.signatory_basis || '')
      setDefaultObligations(user.default_obligations || '')
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [user])

  const fetchSavedRoutes = useCallback(async () => {
    if (!user || user.role !== 'carrier') return
    const supabase = createClient()
    const { data } = await supabase
      .from('saved_routes').select('*').eq('carrier_id', user.id)
      .order('created_at', { ascending: false })
    setSavedRoutes((data || []) as SavedRoute[])
  }, [user])

  const fetchMembers = useCallback(async () => {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('company_members').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true })
    setMembers((data || []) as CompanyMember[])
  }, [user])

  useEffect(() => { fetchSavedRoutes() }, [fetchSavedRoutes])
  useEffect(() => { fetchMembers() }, [fetchMembers])

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('user_avg_ratings').select('avg_rating, review_count')
      .eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setMyRating({ avg: data.avg_rating, count: data.review_count }) })
    supabase.from('reviews').select('*, reviewer:users!reviewer_id(name)')
      .eq('reviewee_id', user.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setMyReviews(data as (Review & { reviewer?: { name: string | null } })[]) })
  }, [user])

  // Profile completion
  function calcCompletion(): number {
    if (!user) return 0
    const base = [name, phone, city, companyName, inn]
    const extended = [kpp, ogrn, legalAddress, bankName, bankAccount, bankBik, signatoryName]
    const extra = user.role === 'carrier' ? [licenseNumber] : []
    const all = [...base, ...extended, ...extra]
    return Math.round((all.filter(f => f.trim() !== '').length / all.length) * 100)
  }

  // Validation for extended fields
  function validateExtended(): string | null {
    if (kpp && !/^\d{9}$/.test(kpp.trim())) return 'КПП должен содержать 9 цифр'
    if (ogrn && !/^\d{13}$|^\d{15}$/.test(ogrn.trim())) return 'ОГРН должен содержать 13 или 15 цифр'
    if (bankBik && !/^\d{9}$/.test(bankBik.trim())) return 'БИК должен содержать 9 цифр'
    if (bankAccount && !/^\d{20}$/.test(bankAccount.trim())) return 'Расчётный счёт должен содержать 20 цифр'
    if (bankCorrAccount && !/^\d{20}$/.test(bankCorrAccount.trim())) return 'Корреспондентский счёт должен содержать 20 цифр'
    return null
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const validErr = validateExtended()
    if (validErr) { toast.error(validErr); return }
    setSaving(true)
    const supabase = createClient()
    const update: Record<string, unknown> = {
      name,
      phone: normalizePhone(phone),
      city,
      kpp: kpp.trim() || null,
      ogrn: ogrn.trim() || null,
      legal_address: legalAddress.trim() || null,
      actual_address: actualAddress.trim() || null,
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
      bank_corr_account: bankCorrAccount.trim() || null,
      bank_bik: bankBik.trim() || null,
      signatory_name: signatoryName.trim() || null,
      signatory_position: signatoryPosition.trim() || null,
      signatory_basis: signatoryBasis.trim() || null,
      default_obligations: defaultObligations.trim() || null,
    }
    if (user.role === 'carrier') {
      update.company_name = companyName.trim() || null
      update.inn = inn.trim() || null
      update.license_number = licenseNumber.trim() || null
    }
    if (user.role === 'client') {
      if (!companyName.trim()) { toast.error('Укажите название компании'); setSaving(false); return }
      if (!inn.trim() || !/^\d{10}$|^\d{12}$/.test(inn.trim())) { toast.error('ИНН должен содержать 10 или 12 цифр'); setSaving(false); return }
      update.company_name = companyName.trim()
      update.inn = inn.trim()
    }
    const { error } = await supabase.from('users').update(update).eq('id', user.id)
    if (error) toast.error(t.profile.saveError)
    else toast.success(t.profile.saveSuccess)
    setSaving(false)
  }

  async function handleLookupInn() {
    const innVal = inn.trim()
    if (!innVal || !/^\d{10}$|^\d{12}$/.test(innVal)) {
      toast.error('Сначала укажите корректный ИНН (10 или 12 цифр)')
      return
    }
    setLookingUp(true)
    try {
      const res = await fetch(`/api/company-lookup?inn=${innVal}`)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Компания не найдена'); return }
      if (data.name) setCompanyName(data.name)
      if (data.kpp) setKpp(data.kpp)
      if (data.ogrn) setOgrn(data.ogrn)
      if (data.legal_address) setLegalAddress(data.legal_address)
      if (data.director_name) setSignatoryName(data.director_name)
      if (data.director_position) setSignatoryPosition(data.director_position)
      setExtOpen(true)
      if (data._stub) {
        toast.info('Заглушка: ' + data._hint)
      } else {
        toast.success(`Данные загружены: ${data.short_name || data.name}`)
      }
    } finally {
      setLookingUp(false)
    }
  }

  async function handleResendEmail() {
    if (!email) return
    setResending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) toast.error(t.profile.emailVerification.resentError)
    else toast.success(t.profile.emailVerification.resentSuccess)
    setResending(false)
  }

  async function handleAddRoute() {
    if (!user || !routeFrom || !routeTo) { toast.error(t.profile.savedRoutes.cityRequired); return }
    setAddingRoute(true)
    const supabase = createClient()
    const { error } = await supabase.from('saved_routes').insert({
      carrier_id: user.id, from_city: routeFrom, to_city: routeTo, container_type: routeContainer || null,
    })
    if (error) toast.error(t.profile.savedRoutes.addError)
    else {
      toast.success(t.profile.savedRoutes.addSuccess)
      setRouteFrom(''); setRouteTo(''); setRouteContainer('')
      fetchSavedRoutes()
    }
    setAddingRoute(false)
  }

  async function handleDeleteRoute(id: string) {
    const supabase = createClient()
    await supabase.from('saved_routes').delete().eq('id', id)
    setSavedRoutes(prev => prev.filter(r => r.id !== id))
  }

  async function handleAddMember() {
    if (!user || !memberName.trim()) { toast.error('Укажите имя сотрудника'); return }
    setAddingMember(true)
    const supabase = createClient()
    const { error } = await supabase.from('company_members').insert({
      owner_id: user.id, name: memberName.trim(),
      position: memberPosition.trim() || null, phone: memberPhone.trim() || null,
    })
    if (error) toast.error('Ошибка при добавлении сотрудника')
    else {
      toast.success('Сотрудник добавлен')
      setMemberName(''); setMemberPosition(''); setMemberPhone('')
      fetchMembers()
    }
    setAddingMember(false)
  }

  async function handleDeleteMember(id: string) {
    const supabase = createClient()
    await supabase.from('company_members').delete().eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  const completion = calcCompletion()

  return (
    <AppLayout>
      <div className="max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.profile.title}</h1>

        {/* Profile completion */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Профиль заполнен на</span>
            <span className={`text-sm font-bold ${completion === 100 ? 'text-green-600' : completion >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
              {completion}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${completion === 100 ? 'bg-green-500' : completion >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          {completion < 100 && (
            <p className="text-xs text-gray-400 mt-2">Заполните реквизиты компании для генерации договора</p>
          )}
        </div>

        {/* Profile form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <User size={24} className="text-blue-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">{user?.name || '—'}</div>
              <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                {user?.role === 'client' ? t.profile.client : t.profile.carrier}
                {user?.is_verified && (
                  <span className="inline-flex items-center gap-1 text-green-600">
                    <Shield size={12} /> {t.profile.verified}
                  </span>
                )}
                {isEmailVerified && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <CheckCircle size={12} /> {t.profile.emailVerified}
                  </span>
                )}
              </div>
            </div>
          </div>

          {email && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5"><Mail size={14} />{t.profile.email}</span>
              </label>
              <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 select-all">
                {email}
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <Input id="name" label={t.profile.nameLabel} value={name} onChange={e => setName(e.target.value)} required />
            <Input id="phone" type="tel" label={t.profile.phone} value={phone} onChange={e => setPhone(e.target.value)} required />
            <Input id="city" label={t.profile.city} value={city} onChange={e => setCity(e.target.value)} required />

            {/* Реквизиты компании */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={14} className="text-gray-400" />
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {user?.role === 'client' ? 'Реквизиты компании' : 'Реквизиты перевозчика'}
                </p>
              </div>
              <div className="space-y-3">
                <Input
                  id="company_name"
                  label={user?.role === 'client' ? 'Название компании' : 'Название компании / ИП'}
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="ООО Ромашка"
                  required={user?.role === 'client'}
                />

                {/* ИНН + кнопка поиска */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">ИНН</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inn}
                      onChange={e => setInn(e.target.value)}
                      placeholder="1234567890"
                      maxLength={12}
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      required={user?.role === 'client'}
                    />
                    <button
                      type="button"
                      onClick={handleLookupInn}
                      disabled={lookingUp}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 shrink-0"
                      title="Заполнить реквизиты по ИНН (DaData)"
                    >
                      <Search size={14} />
                      {lookingUp ? '...' : 'По ИНН'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Нажмите «По ИНН» для автозаполнения</p>
                </div>

                {user?.role === 'carrier' && (
                  <Input
                    id="license_number"
                    label="Номер лицензии"
                    value={licenseNumber}
                    onChange={e => setLicenseNumber(e.target.value)}
                    placeholder="АВ 123456"
                  />
                )}
              </div>
            </div>

            {/* Расширенные реквизиты (для договора) */}
            <div className="border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setExtOpen(v => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    Реквизиты для договора
                  </span>
                  <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">PDF</span>
                </div>
                {extOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {extOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input id="kpp" label="КПП" value={kpp} onChange={e => setKpp(e.target.value)} placeholder="770101001" maxLength={9} />
                    <Input id="ogrn" label="ОГРН" value={ogrn} onChange={e => setOgrn(e.target.value)} placeholder="1234567890123" maxLength={15} />
                  </div>
                  <Input id="legal_address" label="Юридический адрес" value={legalAddress} onChange={e => setLegalAddress(e.target.value)} placeholder="г. Москва, ул. Примерная, д. 1" />
                  <Input id="actual_address" label="Фактический адрес" value={actualAddress} onChange={e => setActualAddress(e.target.value)} placeholder="Если отличается от юридического" />

                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide pt-1">Банковские реквизиты</div>
                  <Input id="bank_name" label="Наименование банка" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="АО Тинькофф Банк" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input id="bank_account" label="Расчётный счёт" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="40702810000000000000" maxLength={20} />
                    <Input id="bank_bik" label="БИК" value={bankBik} onChange={e => setBankBik(e.target.value)} placeholder="044525974" maxLength={9} />
                  </div>
                  <Input id="bank_corr_account" label="Корреспондентский счёт" value={bankCorrAccount} onChange={e => setBankCorrAccount(e.target.value)} placeholder="30101810145250000974" maxLength={20} />

                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide pt-1">Подписант</div>
                  <Input id="signatory_name" label="ФИО подписанта" value={signatoryName} onChange={e => setSignatoryName(e.target.value)} placeholder="Иванов Иван Иванович" />
                  <Input id="signatory_position" label="Должность" value={signatoryPosition} onChange={e => setSignatoryPosition(e.target.value)} placeholder="Генеральный директор" />
                  <Input id="signatory_basis" label="Действует на основании" value={signatoryBasis} onChange={e => setSignatoryBasis(e.target.value)} placeholder="Устава / Доверенности №..." />

                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide pt-1">Стандартные обязанности сторон</div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Обязанности (заменяют стандартный текст в договоре)
                    </label>
                    <textarea
                      value={defaultObligations}
                      onChange={e => setDefaultObligations(e.target.value)}
                      placeholder="Оставьте пустым для использования стандартного текста платформы..."
                      rows={4}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" loading={saving} className="w-full">
              {t.profile.saveChanges}
            </Button>
          </form>
        </div>

        {/* Email verification */}
        {!isEmailVerified && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={18} className="text-amber-500" />
              <span className="font-semibold text-gray-900">{t.profile.emailVerification.title}</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t.profile.emailVerification.hint}</p>
            <Button onClick={handleResendEmail} loading={resending} variant="secondary" className="w-full">
              {t.profile.emailVerification.resend}
            </Button>
          </div>
        )}

        {/* Company members */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-blue-500" />
            <span className="font-semibold text-gray-900">Сотрудники компании</span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Сотрудники не добавлены</p>
          ) : (
            <div className="space-y-2 mb-4">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400 flex gap-2 flex-wrap">
                      {m.position && <span>{m.position}</span>}
                      {m.phone && <span>{m.phone}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteMember(m.id)}
                    className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Добавить сотрудника</div>
            <Input id="memberName" label="Имя" value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Иванов Иван" />
            <Input id="memberPosition" label="Должность" value={memberPosition} onChange={e => setMemberPosition(e.target.value)} placeholder="Менеджер" />
            <Input id="memberPhone" type="tel" label="Телефон" value={memberPhone} onChange={e => setMemberPhone(e.target.value)} placeholder="+7 900 000 00 00" />
            <Button onClick={handleAddMember} loading={addingMember} variant="secondary" className="w-full">
              <Plus size={16} className="mr-1.5" /> Добавить сотрудника
            </Button>
          </div>
        </div>

        {/* Saved routes */}
        {user?.role === 'carrier' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-blue-500" />
              <span className="font-semibold text-gray-900">{t.profile.savedRoutes.title}</span>
            </div>
            {savedRoutes.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">{t.profile.savedRoutes.none}</p>
            ) : (
              <div className="space-y-2 mb-4">
                {savedRoutes.map(r => (
                  <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-sm font-medium text-gray-900 flex-1">
                      {r.from_city} → {r.to_city}
                      {r.container_type && <span className="ml-2 text-xs text-gray-500">{r.container_type}</span>}
                    </span>
                    <button
                      onClick={() => handleDeleteRoute(r.id)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t.profile.savedRoutes.addTitle}</div>
              <div className="grid grid-cols-2 gap-2">
                <CityAutocomplete label={t.profile.savedRoutes.from} value={routeFrom} onChange={setRouteFrom} placeholder={t.common.anyCity} />
                <CityAutocomplete label={t.profile.savedRoutes.to} value={routeTo} onChange={setRouteTo} placeholder={t.common.anyCity} />
              </div>
              <Select
                label={t.profile.savedRoutes.containerOptional}
                value={routeContainer}
                onChange={e => setRouteContainer(e.target.value)}
                options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
                placeholder={t.common.anyType}
              />
              <Button onClick={handleAddRoute} loading={addingRoute} variant="secondary" className="w-full">
                <Plus size={16} className="mr-1.5" /> {t.profile.savedRoutes.add}
              </Button>
            </div>
          </div>
        )}

        {/* Рейтинг и отзывы */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Star size={18} className="text-amber-500" />
            <span className="font-semibold text-gray-900">{t.profile.rating.title}</span>
          </div>
          {myRating ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} size={20} className={s <= Math.round(myRating.avg) ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-200'} />
                  ))}
                </div>
                <RatingBadge avg={myRating.avg} count={myRating.count} />
              </div>
              {myReviews.length > 0 && (
                <div className="space-y-3">
                  {myReviews.map(rv => (
                    <div key={rv.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-sm font-medium text-gray-700">{rv.reviewer?.name || t.profile.rating.anon}</span>
                        <div className="flex gap-0.5 shrink-0">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} size={12} className={s <= rv.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-200'} />
                          ))}
                        </div>
                      </div>
                      {rv.comment && <p className="text-sm text-gray-600">{rv.comment}</p>}
                      <div className="text-xs text-gray-400 mt-1">{formatDateTime(rv.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">{t.profile.rating.noReviews}</p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {t.profile.roleHint} (<strong>{user?.role === 'client' ? t.profile.client : t.profile.carrier}</strong>) {t.profile.roleCannotChange}
        </div>
      </div>
    </AppLayout>
  )
}
