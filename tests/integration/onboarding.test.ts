/**
 * TC-ONB-001+ — Onboarding wizard service-level scenarios.
 *
 * These tests drive the real service against real SQLite databases and verify
 * the resulting DB state independently (not just via the service API).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { OnboardingService } from '@main/services/onboardingService'
import { SettingsService } from '@main/services/settingsService'
import { AuthService } from '@main/services/authService'

let seq = 0
let ctx: DbContext
let onboarding: OnboardingService
const dir = (): string => `/tmp/apex-onb-${process.pid}-${seq}`

const freshDb = (): DbContext => {
  const d = dir()
  seq += 1
  execSync(`rm -rf ${d} && mkdir -p ${d}`)
  return openDatabase(`${d}/apexpos.db`)
}

/** A fully-valid minimal finish payload. */
const validFinish = {
  businessName: 'Test Mart',
  country: 'PK',
  language: 'en',
  currencyCode: 'PKR',
  symbolPosition: 'before' as const,
  timezone: 'Asia/Karachi',
  taxName: 'GST',
  taxRateBps: 1800,
  taxInclusive: false,
  mode: 'hybrid' as const,
  adminUsername: 'boss',
  adminDisplayName: 'The Boss',
  adminPassword: 'Sup3rSecret!',
  adminPin: '9876',
  theme: 'dark' as const,
  registerName: 'Front Counter',
  registerCode: 'REG-01',
  openingFloat: 2000000,
  printerProfile: 'simulator' as const,
  cashDrawerProfile: 'simulator' as const,
  demoData: false
}

beforeEach(() => {
  ctx = freshDb()
  onboarding = new OnboardingService(ctx.db)
})

afterEach(() => ctx.close())

describe('TC-ONB: initial state', () => {
  it('TC-ONB-001 fresh database starts pending with empty draft', () => {
    const s = onboarding.getState()
    expect(s.status).toBe('pending')
    expect(s.stepIndex).toBe(0)
    expect(s.data).toEqual({})
  })

  it('TC-ONB-002 roles and units exist on a fresh database (base seed)', () => {
    const roles = ctx.db.prepare('SELECT COUNT(*) AS c FROM roles').get() as { c: number }
    const units = ctx.db.prepare('SELECT COUNT(*) AS c FROM units').get() as { c: number }
    expect(roles.c).toBeGreaterThanOrEqual(10)
    expect(units.c).toBeGreaterThanOrEqual(7)
    // …but no organization or users exist until finish.
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }).c).toBe(0)
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c).toBe(0)
  })
})

describe('TC-ONB: step persistence (restart safety)', () => {
  it('TC-ONB-003 each step persists; a new service instance resumes the draft', () => {
    onboarding.saveStep('business', 0, { businessName: 'Khyber Traders', phone: '021-111' })
    onboarding.saveStep('tax', 3, { taxName: 'GST', taxRateBps: 1700, taxInclusive: true })

    // Simulate crash/restart: close the DB and open a brand-new connection.
    ctx.close()
    ctx = openDatabase(`${dir().replace(/-\d+$/, `-${seq - 1}`)}/apexpos.db`)
    const revived = new OnboardingService(ctx.db)
    const s = revived.getState()
    expect(s.status).toBe('in_progress')
    expect(s.data.businessName).toBe('Khyber Traders')
    expect(s.data.taxRateBps).toBe(1700)
    expect(s.stepIndex).toBe(3)
  })

  it('TC-ONB-004 invalid step payloads are rejected without corrupting state', () => {
    expect(() =>
      onboarding.saveStep('tax', 3, { taxName: '', taxRateBps: -5, taxInclusive: true })
    ).toThrow()
    expect(() =>
      onboarding.saveStep('currency', 2, { currencyCode: 'TOOLONG', symbolPosition: 'before' })
    ).toThrow()
    expect(() => onboarding.saveStep('nonsense', 9, {})).toThrow()
    // State untouched
    expect(onboarding.getState().status).toBe('pending')
  })
})

describe('TC-ONB: finish', () => {
  it('TC-ONB-005 finish creates org/branch/register/terminal/taxes/admin atomically', () => {
    onboarding.finish(validFinish)
    const q = (sql: string): number => (ctx.db.prepare(sql).get() as { c: number }).c
    expect(q('SELECT COUNT(*) AS c FROM organizations')).toBe(1)
    expect(q('SELECT COUNT(*) AS c FROM branches')).toBe(1)
    expect(q('SELECT COUNT(*) AS c FROM registers')).toBe(1)
    expect(q('SELECT COUNT(*) AS c FROM terminals')).toBe(1)
    expect(q('SELECT COUNT(*) AS c FROM taxes')).toBeGreaterThanOrEqual(2)
    expect(q('SELECT COUNT(*) AS c FROM users')).toBe(1)

    // Property-based FK integrity
    const fk = ctx.db.pragma('foreign_key_check') as unknown[]
    expect(fk).toEqual([])
    expect(ctx.db.pragma('integrity_check') as { integrity_check: string }[]).toEqual([
      { integrity_check: 'ok' }
    ])
  })

  it('TC-ONB-006 administrator can authenticate and holds all permissions', () => {
    onboarding.finish(validFinish)
    const auth = new AuthService(ctx.db)
    const session = auth.login('boss', 'Sup3rSecret!')
    expect(session.user.username).toBe('boss')
    expect(session.permissions).toContain('settings.manage')
    expect(session.permissions).toContain('data.restore') // Administrator = all permissions
    // PIN login also works
    const pinSession = auth.loginPin(session.user.id, '9876')
    expect(pinSession.user.username).toBe('boss')
  })

  it('TC-ONB-007 settings are written per wizard choices', () => {
    onboarding.finish({ ...validFinish, currencyCode: 'USD', theme: 'light', mode: 'restaurant' })
    const settings = new SettingsService(ctx.db)
    expect(settings.get('app.currency').code).toBe('USD')
    expect(settings.get('app.theme')).toBe('light')
    expect(settings.get('app.pos').mode).toBe('restaurant')
    expect(settings.get('app.business').name).toBe('Test Mart')
    const org = ctx.db.prepare('SELECT * FROM organizations').get() as {
      currency: string
      timezone: string
    }
    expect(org.currency).toBe('USD')
    expect(org.timezone).toBe('Asia/Karachi')
  })

  it('TC-ONB-008 demo data option loads catalog without default-tax conflict', () => {
    onboarding.finish({ ...validFinish, demoData: true })
    const products = (ctx.db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c
    const customers = (ctx.db.prepare('SELECT COUNT(*) AS c FROM customers').get() as { c: number })
      .c
    expect(products).toBeGreaterThan(50)
    expect(customers).toBeGreaterThan(5)
    // Exactly one default tax: the wizard's rate wins, demo taxes are samples
    const defaults = ctx.db
      .prepare('SELECT name, rate_bps, is_default FROM taxes WHERE is_default = 1')
      .all() as { name: string; rate_bps: number }[]
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.rate_bps).toBe(1800)
  })

  it('TC-ONB-009 admin password is never persisted into settings or wizard state', () => {
    onboarding.finish(validFinish)
    const raw = ctx.db
      .prepare("SELECT value FROM settings WHERE key = 'app.onboarding'")
      .get() as { value: string }
    expect(raw.value).not.toContain('Sup3rSecret!')
    expect(raw.value).not.toContain('9876')
    // Anywhere in settings at all
    const all = ctx.db.prepare('SELECT value FROM settings').all() as { value: string }[]
    for (const r of all) {
      expect(r.value).not.toContain('Sup3rSecret!')
    }
  })

  it('TC-ONB-010 finish is atomic — invalid payload leaves zero org state', () => {
    expect(() =>
      onboarding.finish({ ...validFinish, adminPassword: 'short' })
    ).toThrow()
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }).c
    ).toBe(0)
    expect(onboarding.getState().status).not.toBe('complete')
  })

  it('TC-ONB-011 double finish is rejected (no duplicate orgs)', () => {
    onboarding.finish(validFinish)
    expect(() => onboarding.finish({ ...validFinish, adminUsername: 'second' })).toThrow(
      /already complete/
    )
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }).c
    ).toBe(1)
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c).toBe(1)
  })

  it('TC-ONB-012 saveStep after completion is rejected', () => {
    onboarding.finish(validFinish)
    expect(() => onboarding.saveStep('business', 0, { businessName: 'X' })).toThrow(
      /already complete/
    )
  })

  it('TC-ONB-013 demo-seeded databases (APEXPOS_SEED_DEMO path) are already complete', () => {
    ctx.close()
    ctx = freshDb()
    seedIfEmpty(ctx.db)
    const svc = new OnboardingService(ctx.db)
    expect(svc.isComplete()).toBe(true)
    // …and finish is refused on top of the demo.
    expect(() => svc.finish(validFinish)).toThrow()
  })
})
