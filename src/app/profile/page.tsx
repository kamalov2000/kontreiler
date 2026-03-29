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
import { SavedRoute, Review } from '@/types/database'
import { toast } from 'sonner'
import { normalizePhone, formatDateTime } from '@/lib/utils'
import { User, Shield, CheckCircle, Phone, Trash2, Plus, MapPin, Star, Mail } from 'lucide-react'
import { CONTAINER_TYPES } from '@/lib/cities'
import { RatingBadge } from '@/components/ui/RatingBadge'

export default function ProfilePage() {
  const { user, loading } = useUser()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [inn, setInn] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [saving, setSaving] = useState(false)

  // Phone verification
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [codeSent, setCodeSent] = useState(false)

  // Saved routes (carrier only)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [routeContainer, setRouteContainer] = useState('')
  const [addingRoute, setAddingRoute] = useState(false)

  // Ratings & reviews
  const [myRating, setMyRating] = useState<{ avg: number; count: number } | null>(null)
  const [myReviews, setMyReviews] = useState<(Review & { reviewer?: { name: string | null } })[]>([])

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone || '')
      setCity(user.city || '')
      setCompanyName(user.company_name || '')
      setInn(user.inn || '')
      setLicenseNumber(user.license_number || '')
    }
    // Fetch email from auth session
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [user])

  const fetchSavedRoutes = useCallback(async () => {
    if (!user || user.role !== 'carrier') return
    const supabase = createClient()
    const { data } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('carrier_id', user.id)
      .order('created_at', { ascending: false })
    setSavedRoutes((data || []) as SavedRoute[])
  }, [user])

  useEffect(() => {
    fetchSavedRoutes()
  }, [fetchSavedRoutes])

  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    supabase
      .from('user_avg_ratings')
      .select('avg_rating, review_count')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setMyRating({ avg: data.avg_rating, count: data.review_count })
      })

    supabase
      .from('reviews')
      .select('*, reviewer:users!reviewer_id(name)')
      .eq('reviewee_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setMyReviews(data as (Review & { reviewer?: { name: string | null } })[])
      })
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const supabase = createClient()
    const update: Record<string, unknown> = { name, phone: normalizePhone(phone), city }
    if (user.role === 'carrier') {
      update.company_name = companyName.trim() || null
      update.inn = inn.trim() || null
      update.license_number = licenseNumber.trim() || null
    }
    const { error } = await supabase
      .from('users')
      .update(update)
      .eq('id', user.id)
    if (error) {
      toast.error(t.profile.saveError)
    } else {
      toast.success(t.profile.saveSuccess)
    }
    setSaving(false)
  }

  async function handleSendCode() {
    if (!user || !phone) {
      toast.error(t.profile.phoneVerification.noPhone)
      return
    }
    setSending(true)
    const normalized = normalizePhone(phone)
    const res = await fetch('/api/phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, phone: normalized }),
    })
    if (res.ok) {
      toast.success(t.profile.phoneVerification.sentHint)
      setCodeSent(true)
    } else {
      toast.error(t.profile.phoneVerification.sendError)
    }
    setSending(false)
  }

  async function handleVerifyCode() {
    if (!user || !code) return
    setVerifying(true)
    const normalized = normalizePhone(phone)
    const res = await fetch('/api/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, phone: normalized, code }),
    })
    if (res.ok) {
      toast.success(t.profile.phoneVerification.successVerify)
      setCodeSent(false)
      setCode('')
      window.location.reload()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Error')
    }
    setVerifying(false)
  }

  async function handleAddRoute() {
    if (!user || !routeFrom || !routeTo) {
      toast.error(t.profile.savedRoutes.cityRequired)
      return
    }
    setAddingRoute(true)
    const supabase = createClient()
    const { error } = await supabase.from('saved_routes').insert({
      carrier_id: user.id,
      from_city: routeFrom,
      to_city: routeTo,
      container_type: routeContainer || null,
    })
    if (error) {
      toast.error(t.profile.savedRoutes.addError)
    } else {
      toast.success(t.profile.savedRoutes.addSuccess)
      setRouteFrom('')
      setRouteTo('')
      setRouteContainer('')
      fetchSavedRoutes()
    }
    setAddingRoute(false)
  }

  async function handleDeleteRoute(id: string) {
    const supabase = createClient()
    await supabase.from('saved_routes').delete().eq('id', id)
    setSavedRoutes(prev => prev.filter(r => r.id !== id))
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

  return (
    <AppLayout>
      <div className="max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.profile.title}</h1>

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
                {user?.is_phone_verified && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <CheckCircle size={12} /> {t.profile.phoneVerified}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Email (readonly) */}
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
            <Input
              id="name"
              label={t.profile.nameLabel}
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
            <Input
              id="phone"
              type="tel"
              label={t.profile.phone}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
            <Input
              id="city"
              label={t.profile.city}
              value={city}
              onChange={e => setCity(e.target.value)}
              required
            />
            {user?.role === 'carrier' && (
              <>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Реквизиты перевозчика</p>
                  <div className="space-y-3">
                    <Input
                      id="company_name"
                      label="Название компании / ИП"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="ООО Транс-Логистик"
                    />
                    <Input
                      id="inn"
                      label="ИНН"
                      value={inn}
                      onChange={e => setInn(e.target.value)}
                      placeholder="1234567890"
                      maxLength={12}
                    />
                    <Input
                      id="license_number"
                      label="Номер лицензии"
                      value={licenseNumber}
                      onChange={e => setLicenseNumber(e.target.value)}
                      placeholder="АВ 123456"
                    />
                  </div>
                </div>
              </>
            )}
            <Button type="submit" loading={saving} className="w-full">
              {t.profile.saveChanges}
            </Button>
          </form>
        </div>

        {/* Phone verification */}
        {!user?.is_phone_verified && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Phone size={18} className="text-amber-500" />
              <span className="font-semibold text-gray-900">{t.profile.phoneVerification.title}</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {t.profile.phoneVerification.hint}
            </p>
            {!codeSent ? (
              <Button onClick={handleSendCode} loading={sending} variant="secondary" className="w-full">
                {t.profile.phoneVerification.send}
              </Button>
            ) : (
              <div className="space-y-3">
                <Input
                  id="verify-code"
                  label={t.profile.phoneVerification.codeLabel}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <Button onClick={handleVerifyCode} loading={verifying} className="flex-1">
                    {t.profile.phoneVerification.confirm}
                  </Button>
                  <Button variant="secondary" onClick={() => { setCodeSent(false); setCode('') }}>
                    {t.common.cancel}
                  </Button>
                </div>
                <button
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() => { setCodeSent(false); handleSendCode() }}
                >
                  {t.profile.phoneVerification.resend}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Saved routes (carriers only) */}
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
                      {r.container_type && (
                        <span className="ml-2 text-xs text-gray-500">{r.container_type}</span>
                      )}
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
                <CityAutocomplete
                  label={t.profile.savedRoutes.from}
                  value={routeFrom}
                  onChange={setRouteFrom}
                  placeholder={t.common.anyCity}
                />
                <CityAutocomplete
                  label={t.profile.savedRoutes.to}
                  value={routeTo}
                  onChange={setRouteTo}
                  placeholder={t.common.anyCity}
                />
              </div>
              <Select
                label={t.profile.savedRoutes.containerOptional}
                value={routeContainer}
                onChange={e => setRouteContainer(e.target.value)}
                options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
                placeholder={t.common.anyType}
              />
              <Button
                onClick={handleAddRoute}
                loading={addingRoute}
                variant="secondary"
                className="w-full"
              >
                <Plus size={16} className="mr-1.5" />
                {t.profile.savedRoutes.add}
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
