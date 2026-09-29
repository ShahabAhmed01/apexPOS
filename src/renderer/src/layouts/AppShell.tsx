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
  Search,
  Wifi,
  WifiOff,
  Globe
} from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
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
  const langMenuRef = useRef<HTMLDivElement>(null)

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

  // Dismiss the language menu on outside pointer press or Escape.
  useEffect(() => {
    if (!langMenuOpen) return
    const onPointer = (e: PointerEvent): void => {
      if (!langMenuRef.current?.contains(e.target as Node)) setLangMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLangMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [langMenuOpen])

  const doLogout = async (): Promise<void> => {
    await window.api.auth.logout()
    logout()
    navigate('/')
  }

  const visibleNav = NAV.filter((n) => session?.permissions.includes(n.perm))

  /** The palette listens for Ctrl/⌘+K on window — surface the same shortcut. */
  const openPalette = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  }

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
        className="flex w-16 flex-col items-center gap-0.5 border-e border-[var(--color-border)] bg-[var(--color-bg-1)] py-3"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-solid)] text-base font-bold tracking-tight text-white shadow-[var(--shadow-raised)]">
          A
        </div>
        {visibleNav.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            className={({ isActive }) =>
              `flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] ${
                isActive
                  ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)] active:bg-[var(--color-bg-3)]'
              }`
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-0.5">
          <button
            onClick={async () => {
              await window.api.app.lock()
              lock()
            }}
            title="Lock"
            aria-label="Lock screen"
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-2)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)] active:bg-[var(--color-bg-3)]"
          >
            <Lock size={20} />
          </button>
          <button
            onClick={() => void doLogout()}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-2)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)] active:bg-[var(--color-bg-3)]"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-1)] px-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide">APEXPOS</span>
            <span className="text-xs text-[var(--color-text-2)]">Main Branch</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-1)]">
            <span className="nums hidden md:inline">{clock.format('HH:mm:ss')}</span>
            <span className="hidden items-center gap-1.5 md:flex">
              {online ? (
                <Wifi size={13} className="text-[var(--color-success)]" />
              ) : (
                <WifiOff size={13} className="text-[var(--color-danger)]" />
              )}
              {online ? t('app.networkOnline') : t('app.networkOffline')}
            </span>
            {/* Command palette affordance — same Ctrl/⌘ K shortcut the palette binds */}
            <button
              onClick={openPalette}
              aria-label={`${t('app.search')} — Ctrl K`}
              className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-2)] px-2.5 text-[var(--color-text-2)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-0)]"
            >
              <Search size={14} aria-hidden />
              <span className="hidden lg:inline">{t('app.search')}</span>
              <span className="kbd" aria-hidden>
                Ctrl K
              </span>
            </button>
            <span className="flex h-8 items-center rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] px-2.5 font-medium">
              {session?.user.displayName} · {session?.user.roleName}
            </span>
            {/* Language selector */}
            <div className="relative" role="group" aria-label={t('settings.language')}>
              <button
                className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-bg-2)] px-2.5 text-xs text-[var(--color-text-0)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-3)]"
                aria-haspopup="menu"
                aria-expanded={langMenuOpen}
                onClick={() => setLangMenuOpen((o) => !o)}
              >
                <Globe size={14} aria-hidden />
                {SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.label ?? lang}
              </button>
              {langMenuOpen && (
                <div
                  ref={langMenuRef}
                  role="menu"
                  className="absolute end-0 top-full z-50 mt-1 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] py-1 shadow-[var(--shadow-overlay)] animate-[var(--animate-popover-in)]"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      role="menuitem"
                      onClick={() => {
                        setLangMenuOpen(false)
                        void handleLangChange(l.code)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm transition-colors duration-[var(--duration-fast)] ${
                        lang === l.code
                          ? 'bg-[var(--color-accent-subtle)] font-medium text-[var(--color-accent)]'
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
