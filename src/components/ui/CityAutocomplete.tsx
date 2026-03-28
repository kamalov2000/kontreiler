'use client'

import { useState, useRef, useEffect } from 'react'
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
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
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
            'w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 bg-white text-gray-900 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'placeholder:text-gray-400',
            error && 'border-red-500 focus:ring-red-500'
          )}
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {filtered.map(city => (
              <li
                key={city}
                className="px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700"
                onMouseDown={() => {
                  onChange(city)
                  setQuery(city)
                  setOpen(false)
                }}
              >
                {city}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
