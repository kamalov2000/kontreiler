'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { RUSSIAN_CITIES } from '@/lib/cities'
import { cn } from '@/lib/utils'

interface CityAutocompleteProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
  id?: string
}

// Подсветка совпадения: часть города, совпавшая с запросом, — жирным
function highlightMatch(city: string, query: string) {
  const q = query.trim()
  if (!q) return city
  const idx = city.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return city
  return (
    <>
      {city.slice(0, idx)}
      <b className="font-semibold text-ink">{city.slice(idx, idx + q.length)}</b>
      {city.slice(idx + q.length)}
    </>
  )
}

export function CityAutocomplete({
  value,
  onChange,
  label,
  placeholder = 'Введите город',
  error,
  id,
}: CityAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query.length >= 1
    ? RUSSIAN_CITIES.filter(c =>
        c.toLowerCase().startsWith(query.toLowerCase()) ||
        c.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className={cn(
            'mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em]',
            error ? 'text-danger' : 'text-ink-3'
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin
          size={15}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          id={id}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
            onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cn(
            'h-11 w-full rounded-field border border-hairline bg-surface pl-9 pr-3 text-[15px] text-ink',
            'transition-colors placeholder:text-ink-4',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
            error &&
              'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
          )}
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 flex w-full flex-col gap-px overflow-y-auto rounded-card border border-hairline bg-surface p-1 shadow-overlay max-h-56">
            {filtered.map(city => (
              <li
                key={city}
                className="group flex cursor-pointer items-center gap-2 rounded-field px-2.5 py-2 text-sm text-ink-2 hover:bg-accent-soft hover:text-accent"
                onMouseDown={() => {
                  onChange(city)
                  setQuery(city)
                  setOpen(false)
                }}
              >
                <MapPin
                  size={14}
                  strokeWidth={1.5}
                  className="flex-none text-ink-4 group-hover:text-accent"
                />
                <span>{highlightMatch(city, query)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
