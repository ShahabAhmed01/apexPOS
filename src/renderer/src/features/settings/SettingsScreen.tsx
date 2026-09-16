import { useThemeStore } from '../../stores/themeStore'

/** Minimal P0 settings — theme switching. Full sections built in Phase 9. */
export const SettingsScreen = (): React.ReactElement => {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <section className="mt-6 max-w-md">
        <h2 className="text-sm font-medium text-[var(--color-text-1)]">Appearance</h2>
        <div className="mt-3 flex gap-2">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
              className={`rounded-[var(--radius-sm)] border px-4 py-2 text-sm capitalize transition-colors ${
                theme === t
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
