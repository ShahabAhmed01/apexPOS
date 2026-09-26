import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  UtensilsCrossed,
  ChefHat,
  Users,
  BarChart3,
  Settings,
  Lock,
  LogOut,
  Wifi,
  WifiOff,
  Globe
} from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { CommandPalette } from '../components/CommandPalette'
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../i18n'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', perm: 'reports.view' },
  { to: '/pos', icon: ShoppingCart, labelKey: 'nav.pos', perm: 'sales.create' },
  { to: '/inventory', icon: Package, labelKey: 'nav.inventory', perm: 'inventory.view' },
  { to: '/purchasing', icon: Truck, labelKey: 'nav.purchasing', perm: 'purchases.view' },
  { to: '/floor', icon: UtensilsCrossed, labelKey: 'nav.floor', perm: 'tables.view' },
  { to: '/kitchen', icon: ChefHat, labelKey: 'nav.kitchen', perm: 'kitchen.view' },
  { to: '/customers', icon: Users, labelKey: 'nav.customers', perm: 'customers.view' },
  { to: '/reports', icon: BarChart3, labelKey: 'nav.reports', perm: 'reports.view' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', perm: 'settings.manage' }
] as const

export const AppShell = (): React.ReactElement => {
  const { session, lock, logout } = useSessionStore()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [clock, setClock] = useState(dayjs())
  const [online, setOnline] = useState(navigator.onLine)
  const [lang, setLang] = useState(i18n.language)
  const [langMenuOpen, setLangMenuOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setClock(dayjs()), 1000)
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const doLogout = async (): Promise<void> => {
    await window.api.auth.logout()
    logout()
    navigate('/')
  }

  const visibleNav = NAV.filter((n) => session?.permissions.includes(n.perm))

  const handleLangChange = async (newLang: string): Promise<void> => {
    await setAppLanguage(newLang)
    setLang(newLang)
    const current = await window.api.settings.get('app.localization')
    if (current.ok) {
      void window.api.settings.set('app.localization', { ...current.data, language: newLang })
    }
  }

  return (
    <div className="flex h-full bg-[var(--color-bg-0)] text-[var(--color-text-0)]">
      {/* Icon rail */}
      <nav
        aria-label="Primary"
        className="flex w-16 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-bg-1)] py-3 gap-1"
      >
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-solid)] font-bold text-white">
          A
        </div>
        {visibleNav.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            className={({ isActive }) =>
              `flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)]'
              }`
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-1">
          <button
            onClick={async () => {
              await window.api.app.lock()
              lock()
            }}
            title="Lock"
            aria-label="Lock screen"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]"
          >
            <Lock size={20} />
          </button>
          <button
            onClick={() => void doLogout()}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-1)] px-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide">APEXPOS</span>
            <span className="text-xs text-[var(--color-text-2)]">Main Branch</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-1)]">
            <span className="nums">{clock.format('HH:mm:ss')}</span>
            <span className="flex items-center gap-1">
              {online ? (
                <Wifi size={14} className="text-[var(--color-success)]" />
              ) : (
                <WifiOff size={14} className="text-[var(--color-danger)]" />
              )}
              {online ? t('app.networkOnline') : t('app.networkOffline')}
            </span>
            <span className="rounded-md bg-[var(--color-bg-2)] px-2 py-1">
              {session?.user.displayName} · {session?.user.roleName}
            </span>
            {/* Language selector */}
            <div className="relative" role="group" aria-label={t('settings.language')}>
              <button
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-bg-2)] px-2 py-1 text-xs text-[var(--color-text-0)] hover:bg-[var(--color-bg-3)]"
                aria-haspopup="menu"
                aria-expanded={langMenuOpen}
                onClick={() => setLangMenuOpen((o) => !o)}
              >
                <Globe size={14} />
                {SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.label ?? lang}
              </button>
              {langMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] py-1 shadow-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      role="menuitem"
                      onClick={() => {
                        setLangMenuOpen(false)
                        void handleLangChange(l.code)
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${
                        lang === l.code
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-0)] hover:bg-[var(--color-bg-2)]'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
        <CommandPalette />
      </div>
    </div>
  )
}
