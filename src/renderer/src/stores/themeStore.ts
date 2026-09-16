import { create } from 'zustand'
import type { ThemePreference } from '@shared/settings/registry'

interface ThemeState {
  theme: ThemePreference
  resolved: 'dark' | 'light'
  setTheme: (t: ThemePreference) => void
  load: () => Promise<void>
}

const resolve = (t: ThemePreference): 'dark' | 'light' => {
  if (t !== 'system') return t
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const apply = (resolved: 'dark' | 'light') => {
  document.documentElement.dataset.theme = resolved
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolved: 'dark',
  setTheme: (theme) => {
    const resolved = resolve(theme)
    apply(resolved)
    set({ theme, resolved })
    void window.api.settings.setTheme(theme)
  },
  load: async () => {
    const stored = localStorage.getItem('apexpos.theme') as ThemePreference | null
    const theme = stored ?? 'dark'
    const resolved = resolve(theme)
    apply(resolved)
    set({ theme, resolved })

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().theme === 'system') {
        const r = resolve('system')
        apply(r)
        set({ resolved: r })
      }
    })
  }
}))
