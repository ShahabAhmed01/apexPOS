import { forwardRef } from 'react'
import { clsx } from 'clsx'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
}

const variants: Record<string, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-pressed)]',
  secondary:
    'bg-[var(--color-bg-3)] text-[var(--color-text-0)] border border-[var(--color-border)] hover:bg-[var(--color-bg-2)]',
  danger: 'bg-[var(--color-danger)] text-white hover:brightness-110',
  ghost: 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)]',
  success: 'bg-[var(--color-success)] text-[#0b0e13] hover:brightness-110'
}

const sizes = {
  sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm rounded-[var(--radius-sm)]',
  lg: 'h-12 px-5 text-base rounded-[var(--radius-md)]',
  xl: 'h-14 px-6 text-lg rounded-[var(--radius-md)] font-semibold'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
