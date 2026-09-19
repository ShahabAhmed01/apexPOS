import { forwardRef, type SelectHTMLAttributes } from 'react'
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
  ({ label, options, onChange, className = '', ...rest }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]">{label}</span>
      )}
      <span className="relative block">
        <select
          ref={ref}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] px-3 py-2 pr-8 text-sm text-[var(--color-text-0)] focus:border-[var(--color-accent)] focus:outline-none ${className}`}
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
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]"
          aria-hidden
        />
      </span>
    </label>
  )
)
Select.displayName = 'Select'
