import { useCallback, useEffect, useState } from 'react'
import {
  Palette, Store, Globe2, Banknote, ShoppingCart, Shield, DatabaseBackup, Bell
} from 'lucide-react'
import { Button } from '../../design-system/Button'
import { Input } from '../../design-system/Input'
import { Select } from '../../design-system/Select'
import { Switch } from '../../design-system/Switch'
import { useThemeStore } from '../../stores/themeStore'
import { usePermission } from '../../stores/sessionStore'
import type { AppNotification } from '@shared/types/models'
import type { BackupFile } from '@shared/ipc/api'
import {
  type businessSettingsSchema, type localizationSettingsSchema,
  type currencySettingsSchema, type posSettingsSchema, type securitySettingsSchema
} from '@shared/settings/registry'
import type { z } from 'zod'

type Business = z.infer<typeof businessSettingsSchema>
type Localization = z.infer<typeof localizationSettingsSchema>
type Currency = z.infer<typeof currencySettingsSchema>
type PosCfg = z.infer<typeof posSettingsSchema>
type Security = z.infer<typeof securitySettingsSchema>

type SectionKey = 'appearance' | 'business' | 'localization' | 'currency' | 'pos' | 'security' | 'backup'

const SECTIONS: { key: SectionKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'business', label: 'Business', icon: Store },
  { key: 'localization', label: 'Localization', icon: Globe2 },
  { key: 'currency', label: 'Currency', icon: Banknote },
  { key: 'pos', label: 'POS behavior', icon: ShoppingCart },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'backup', label: 'Backup & data', icon: DatabaseBackup }
]

export const SettingsScreen = (): React.ReactElement => {
  const { theme, setTheme } = useThemeStore()
  const canManage = usePermission('settings.manage')
  const [section, setSection] = useState<SectionKey>('appearance')

  const [business, setBusiness] = useState<Business | null>(null)
  const [localization, setLocalization] = useState<Localization | null>(null)
  const [currency, setCurrency] = useState<Currency | null>(null)
  const [posCfg, setPosCfg] = useState<PosCfg | null>(null)
  const [security, setSecurity] = useState<Security | null>(null)

  const [backups, setBackups] = useState<BackupFile[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const [b, l, c, p, s] = await Promise.all([
      window.api.settings.get('app.business'),
      window.api.settings.get('app.localization'),
      window.api.settings.get('app.currency'),
      window.api.settings.get('app.pos'),
      window.api.settings.get('app.security')
    ])
    if (b.ok) setBusiness(b.data as Business)
    if (l.ok) setLocalization(l.data as Localization)
    if (c.ok) setCurrency(c.data as Currency)
    if (p.ok) setPosCfg(p.data as PosCfg)
    if (s.ok) setSecurity(s.data as Security)

    const bl = await window.api.backup.list()
    if (bl.ok) setBackups(bl.data)
    const n = await window.api.notifications.list()
    if (n.ok) setNotifications(n.data)
  }, [])

  useEffect(() => { void load() }, [load])

  const flashMsg = (msg: string): void => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2500)
  }

  const save = async <K extends 'app.business' | 'app.localization' | 'app.currency' | 'app.pos' | 'app.security'>(
    key: K, value: unknown
  ): Promise<void> => {
    setBusy(true)
    const res = await window.api.settings.set(key, value as never)
    setBusy(false)
    if (res.ok) flashMsg('Saved')
    else flashMsg(`Error: ${res.error.message}`)
  }

  const runBackup = async (): Promise<void> => {
    setBusy(true)
    const res = await window.api.backup.create()
    setBusy(false)
    if (res.ok) {
      flashMsg(`Backup created (${(res.data.sizeBytes / 1024 / 1024).toFixed(1)} MB)`)
      void load()
    } else flashMsg(`Backup failed: ${res.error.message}`)
  }

  const restore = async (b: BackupFile): Promise<void> => {
    if (!confirm(`Restore backup from ${new Date(b.createdAt).toLocaleString()}? The app will restart.`)) return
    const res = await window.api.backup.restore(b.file.split('/').pop()!)
    if (!res.ok) flashMsg(`Restore failed: ${res.error.message}`)
  }

  const marker = (onValue: string, currentValue: string): string =>
    onValue === currentValue
      ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
      : 'border-[var(--color-border)] text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'

  return (
    <div className="flex h-full">
      <nav className="w-52 border-r border-[var(--color-border)] p-2" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            aria-pressed={section === s.key}
            className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
              section === s.key
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'
            }`}
          >
            <s.icon size={15} aria-hidden /> {s.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold capitalize">{SECTIONS.find((s) => s.key === section)?.label}</h1>
          {flash && (
            <p role="status" className="rounded bg-[var(--color-bg-2)] px-3 py-1 text-xs text-[var(--color-text-1)]">
              {flash}
            </p>
          )}
        </div>

        {section === 'appearance' && (
          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button key={t} onClick={() => setTheme(t)} aria-pressed={theme === t}
                  className={`rounded-[var(--radius-sm)] border px-4 py-2 text-sm capitalize ${marker(t, theme)}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {section === 'business' && business && (
          <div className="mt-4 max-w-lg space-y-3">
            <Input label="Business name" value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
            <Input label="Legal name" value={business.legalName} onChange={(e) => setBusiness({ ...business, legalName: e.target.value })} />
            <Input label="Address" value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
              <Input label="Email" type="email" value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
            </div>
            <Input label="Tax ID" value={business.taxId} onChange={(e) => setBusiness({ ...business, taxId: e.target.value })} />
            <Button disabled={!canManage || busy} onClick={() => void save('app.business', business)}>Save business info</Button>
          </div>
        )}

        {section === 'localization' && localization && (
          <div className="mt-4 max-w-lg space-y-3">
            <Select label="Timezone" value={localization.timezone} onChange={(v) => setLocalization({ ...localization, timezone: v })}
              options={['Asia/Karachi', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'].map((tz) => ({ value: tz, label: tz }))} />
            <Select label="Date format" value={localization.dateFormat} onChange={(v) => setLocalization({ ...localization, dateFormat: v })}
              options={['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((f) => ({ value: f, label: f }))} />
            <Input label="Time format" value={localization.timeFormat} onChange={(e) => setLocalization({ ...localization, timeFormat: e.target.value as '12h' | '24h' })} />
            <Button disabled={!canManage || busy} onClick={() => void save('app.localization', localization)}>Save localization</Button>
          </div>
        )}

        {section === 'currency' && currency && (
          <div className="mt-4 max-w-lg space-y-3">
            <Select label="Currency" value={currency.code} onChange={(v) => setCurrency({ ...currency, code: v })}
              options={['PKR', 'USD', 'EUR', 'AED', 'GBP'].map((c) => ({ value: c, label: c }))} />
            <Select label="Symbol position" value={currency.symbolPosition} onChange={(v) => setCurrency({ ...currency, symbolPosition: v as 'before' | 'after' })}
              options={[{ value: 'before', label: 'Rs 1,250.00' }, { value: 'after', label: '1,250.00 Rs' }]} />
            <Button disabled={!canManage || busy} onClick={() => void save('app.currency', currency)}>Save currency</Button>
          </div>
        )}

        {section === 'pos' && posCfg && (
          <div className="mt-4 max-w-lg space-y-4">
            <Select label="Operating mode" value={posCfg.mode} onChange={(v) => setPosCfg({ ...posCfg, mode: v as PosCfg['mode'] })}
              options={[
                { value: 'hybrid', label: 'Hybrid (retail + restaurant)' },
                { value: 'retail', label: 'Retail only' },
                { value: 'restaurant', label: 'Restaurant only' }
              ]} />
            <Switch label="Auto-print receipt after payment" checked={posCfg.autoPrintReceipt} onCheckedChange={(v) => setPosCfg({ ...posCfg, autoPrintReceipt: v })} />
            <Switch label="Allow negative stock" checked={posCfg.allowNegativeStock} onCheckedChange={(v) => setPosCfg({ ...posCfg, allowNegativeStock: v })} />
            <Switch label="Confirm before clearing cart" checked={posCfg.confirmOnClear} onCheckedChange={(v) => setPosCfg({ ...posCfg, confirmOnClear: v })} />
            <Switch label="Scan sound" checked={posCfg.scanSound} onCheckedChange={(v) => setPosCfg({ ...posCfg, scanSound: v })} />
            <Button disabled={!canManage || busy} onClick={() => void save('app.pos', posCfg)}>Save POS settings</Button>
          </div>
        )}

        {section === 'security' && security && (
          <div className="mt-4 max-w-lg space-y-3">
            <Input label="Auto-lock after (minutes, 0 = never)" type="number" min={0} max={240}
              value={String(security.autoLockMinutes)} onChange={(e) => setSecurity({ ...security, autoLockMinutes: Number(e.target.value) })} />
            <Input label="Session length (hours)" type="number" min={1} max={72}
              value={String(security.sessionHours)} onChange={(e) => setSecurity({ ...security, sessionHours: Number(e.target.value) })} />
            <Input label="Max failed login attempts" type="number" min={3} max={10}
              value={String(security.maxLoginAttempts)} onChange={(e) => setSecurity({ ...security, maxLoginAttempts: Number(e.target.value) })} />
            <Input label="Lockout minutes" type="number" min={1} max={60}
              value={String(security.lockoutMinutes)} onChange={(e) => setSecurity({ ...security, lockoutMinutes: Number(e.target.value) })} />
            <Button disabled={!canManage || busy} onClick={() => void save('app.security', security)}>Save security settings</Button>
          </div>
        )}

        {section === 'backup' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Button disabled={!canManage || busy} onClick={() => void runBackup()}>
                <DatabaseBackup size={14} className="mr-1" aria-hidden /> New backup
              </Button>
              <p className="text-xs text-[var(--color-text-2)]">Backups are consistent snapshots of the local database.</p>
            </div>
            <table className="w-full max-w-2xl text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-2)]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-sm text-[var(--color-text-2)]">No backups yet.</td></tr>
                ) : backups.map((b) => (
                  <tr key={b.file} className="border-b border-[var(--color-border)]/50">
                    <td className="py-2 pr-3">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-3 nums">{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="py-2 text-right">
                      <Button variant="secondary" size="sm" disabled={!canManage || busy} onClick={() => void restore(b)}>Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Recent notifications for the current user */}
            <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold">
              <Bell size={14} aria-hidden /> Recent notifications
            </h2>
            <ul className="max-w-2xl space-y-1">
              {notifications.map((n) => (
                <li key={n.id} className={`rounded-[var(--radius-sm)] border p-3 text-sm ${n.isRead ? 'opacity-60' : 'border-[var(--color-border)]'}`}>
                  <div className="flex justify-between">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-xs text-[var(--color-text-2)]">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-[var(--color-text-1)]">{n.body}</p>}
                </li>
              ))}
              {notifications.length === 0 && (
                <p className="text-sm text-[var(--color-text-2)]">No notifications.</p>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
