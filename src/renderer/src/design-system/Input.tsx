import { forwardRef, useId } from 'react'
import { clsx } from 'clsx'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={clsx(
            'w-full rounded-[var(--radius-sm)] border bg-[var(--color-bg-0)] px-3 py-2 text-sm outline-none transition-colors',
            'placeholder:text-[var(--color-text-2)]',
            error
              ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)]'
              : 'border-[var(--color-border)] focus:border-[var(--color-accent)]',
            className
          )}
          {...rest}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-[var(--color-text-2)]">
            {hint}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
