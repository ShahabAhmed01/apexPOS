import { clsx } from 'clsx'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-bg-2)] text-[var(--color-text-1)] border-[var(--color-border)]',
  accent: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-transparent',
  success: 'bg-[var(--color-success-subtle)] text-[var(--color-success)] border-transparent',
  warning: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border-transparent',
  danger: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border-transparent',
  info: 'bg-[var(--color-info-subtle)] text-[var(--color-info)] border-transparent'
}

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

/** Compact semantic status pill — color + text, never color alone. */
export const Badge = ({
  tone = 'neutral',
  className,
  children
}: BadgeProps): React.ReactElement => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      tones[tone],
      className
    )}
  >
    {children}
  </span>
)
