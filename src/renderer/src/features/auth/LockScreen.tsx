import { useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { Lock } from 'lucide-react'

export const LockScreen = (): React.ReactElement => {
  const { session, unlock, logout } = useSessionStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const tryUnlock = async (): Promise<void> => {
    if (!session) return
    const res = await window.api.auth.loginPin({ userId: session.user.id, pin })
    if (res.ok) unlock()
    else {
      setError(res.error.message)
      setPin('')
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-bg-0)]">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)]">
          <Lock size={24} className="text-[var(--color-text-1)]" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{session?.user.displayName}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-1)]">Enter your PIN to unlock</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void tryUnlock()
          }}
          className="mt-6"
        >
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setError(null)
            }}
            className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] px-4 text-center text-lg tracking-[0.5em] text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
            aria-label="PIN"
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="mt-4 h-10 w-full rounded-[var(--radius-sm)] bg-[var(--color-accent-solid)] text-sm font-medium text-white shadow-[var(--shadow-raised)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-solid-hover)] active:bg-[var(--color-accent-pressed)]"
          >
            Unlock
          </button>
        </form>

        <button
          onClick={() => logout()}
          className="mt-6 text-xs text-[var(--color-text-2)] underline underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-1)]"
        >
          Sign in as a different user
        </button>
      </div>
    </div>
  )
}
