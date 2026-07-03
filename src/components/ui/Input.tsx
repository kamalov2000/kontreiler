import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
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
        <input
          ref={ref}
          id={id}
          className={cn(
            'h-11 w-full rounded-field border border-hairline bg-surface px-3 text-[15px] text-ink',
            'transition-colors placeholder:text-ink-4',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
            'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-sunken disabled:text-ink-4',
            error &&
              'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
