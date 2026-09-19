import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSessionStore } from '../../stores/sessionStore'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

type FormValues = z.infer<typeof schema>

export const LoginScreen = (): React.ReactElement => {
  const setSession = useSessionStore((s) => s.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema)
  })

  const onSubmit = handleSubmit(async (values) => {
    setBusy(true)
    setServerError(null)
    try {
      const result = await window.api.auth.login(values)
      if (result.ok) {
        setSession(result.data)
      } else {
        setServerError(result.error.message)
      }
    } finally {
      setBusy(false)
    }
  })

  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-bg-0)] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)] text-xl font-bold text-white">
            A
          </div>
          <h1 className="text-2xl font-semibold">APEXPOS</h1>
          <p className="mt-1 text-sm text-[var(--color-text-1)]">Sign in to your terminal</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-6 space-y-4"
          aria-busy={busy}
        >
          {serverError && (
            <div
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {serverError}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-text-2)] focus:border-[var(--color-accent)]"
              placeholder="cashier"
              {...register('username')}
            />
            {formState.errors.username && (
              <p className="mt-1 text-xs text-[var(--color-danger)]">
                {formState.errors.username.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-text-2)] focus:border-[var(--color-accent)]"
              placeholder="••••••••"
              {...register('password')}
            />
            {formState.errors.password && (
              <p className="mt-1 text-xs text-[var(--color-danger)]">
                {formState.errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[var(--radius-sm)] bg-[var(--color-accent)] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--color-text-2)]">
          Terminal 1 · Main Branch
        </p>
      </div>
    </div>
  )
}
