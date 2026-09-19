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
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-bg-2)]">
          <Lock size={28} className="text-[var(--color-text-1)]" />
        </div>
        <h2 className="text-lg font-semibold">{session?.user.displayName}</h2>
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
            className="w-48 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] px-4 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-[var(--color-accent)]"
            aria-label="PIN"
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </form>

        <button
          onClick={() => logout()}
          className="mt-6 text-xs text-[var(--color-text-2)] underline underline-offset-2 hover:text-[var(--color-text-1)]"
        >
          Sign in as a different user
        </button>
      </div>
    </div>
  )
}
