import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { SettingsService } from '@main/services/settingsService'
import { SystemService } from '@main/services/systemService'

let ctx: DbContext
let settings: SettingsService
let system: SystemService
const dir = `/tmp/opencode/apex/settings-${process.pid}`

beforeAll(() => {
  execSync(`rm -rf ${dir} && mkdir -p ${dir}`)
  ctx = openDatabase(`${dir}/apexpos.db`)
  seedIfEmpty(ctx.db)
  settings = new SettingsService(ctx.db)
  system = new SystemService(ctx.db, dir)
})

afterAll(() => ctx.close())

describe('SettingsService', () => {
  it('returns registry defaults on first boot', () => {
    expect(settings.get('app.theme')).toBe('dark')
    expect(settings.get('app.currency').code).toBe('PKR')
    expect(settings.get('app.security').autoLockMinutes).toBe(5)
  })

  it('persists validated updates and rejects invalid values', () => {
    settings.set('app.currency', {
      code: 'USD',
      symbolPosition: 'before',
      thousandsSeparator: ',',
      decimalSeparator: '.'
    })
    expect(settings.get('app.currency').code).toBe('USD')
    expect(() =>
      settings.set('app.security', {
        autoLockMinutes: 9999,
        sessionHours: 12,
        maxLoginAttempts: 5,
        lockoutMinutes: 5
      })
    ).toThrow()
  })

  it('lists all settings via all()', () => {
    const all = settings.all()
    expect(all['app.business']).toHaveProperty('name')
    expect(all['app.theme']).toBeDefined()
  })
})

describe('SystemService', () => {
  it('creates a real restorable backup file', () => {
    const b = system.createBackup()
    expect(existsSync(b.file)).toBe(true)
    expect(b.sizeBytes).toBeGreaterThan(10000)
    const list = system.listBackups()
    expect(list.map((x) => x.file)).toContain(b.file)
  })

  it('lists and marks notifications read', () => {
    ctx.db
      .prepare(
        "INSERT INTO notifications (id, kind, severity, title, is_read, created_at) VALUES ('n1', 'test', 'info', 'Test', 0, '2026-01-01T00:00:00Z')"
      )
      .run()
    expect(system.notifications(true).map((n) => n.id)).toContain('n1')
    system.markNotificationRead('n1')
    expect(system.notifications(true).map((n) => n.id)).not.toContain('n1')
    expect(system.notifications(false).map((n) => n.id)).toContain('n1')
  })
})
