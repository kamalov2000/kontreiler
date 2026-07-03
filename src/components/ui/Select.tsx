import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

// Иконка-шеврон (stroke #64748B) как data-uri фона — нативная стрелка скрыта appearance-none
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")"

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, placeholder, ...props }, ref) => {
    return (
      <div className="w-full">
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
        <select
          ref={ref}
          id={id}
          style={{
            backgroundImage: CHEVRON,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
          }}
          className={cn(
            'h-11 w-full appearance-none rounded-field border border-hairline bg-surface pl-3 pr-9 text-[15px] text-ink',
            'transition-colors',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
            'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-sunken disabled:text-ink-4',
            error &&
              'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
