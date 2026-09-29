import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string
  options: SelectOption[]
  onChange?: (value: string) => void
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, options, onChange, className = '', id, ...rest }, ref) => {
    const autoId = useId()
    const selectId = id ?? autoId
    return (
      <div className="block">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]"
          >
            {label}
          </label>
        )}
        <span className="relative block">
          <select
            ref={ref}
            id={selectId}
            onChange={(e) => onChange?.(e.target.value)}
            className={`h-9 w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] ps-3 pe-8 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]"
            aria-hidden
          />
        </span>
      </div>
    )
  }
)
Select.displayName = 'Select'
