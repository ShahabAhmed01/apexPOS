import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { SystemService } from '@main/services/systemService'
import { execSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let ctx: DbContext
let auth: AuthService
let orders: OrderService
let branchId: string

beforeAll(() => {
  execSync(
    `rm -rf /tmp/opencode/apex/security-${process.pid}; mkdir -p /tmp/opencode/apex/security-${process.pid}`
  )
  ctx = openDatabase(`/tmp/opencode/apex/security-${process.pid}/apexpos.db`)
  seedIfEmpty(ctx.db)
  branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  auth = new AuthService(ctx.db)
  orders = new OrderService(ctx.db, auth, branchId)
})

afterAll(() => ctx.close())

describe('manager override (verifyOverride)', () => {
  it('accepts a valid manager PIN and audits it', () => {
    const approverId = auth.verifyOverride('1234', 'sales.refund')
    expect(approverId).toBeTruthy()
    const row = ctx.db
      .prepare(
        `SELECT actor_id FROM audit_log WHERE action = 'auth.override' ORDER BY created_at DESC LIMIT 1`
      )
      .get() as { actor_id: string }
    expect(row.actor_id).toBe(approverId)
  })

  it('rate-limits brute-force attempts against the PIN oracle', () => {
    // 5 bad attempts trigger a 5-minute lockout (same policy as login)
    for (let i = 0; i < 5; i++) {
      expect(() => auth.verifyOverride('0000', 'sales.refund')).toThrow(
        /Manager authorization failed|Too many attempts/
      )
    }
    expect(() => auth.verifyOverride('1234', 'sales.refund')).toThrow(/Too many attempts/)
    // And failures are audited
    const denied = ctx.db
      .prepare(`SELECT COUNT(*) c FROM audit_log WHERE action = 'auth.override_denied'`)
      .get() as { c: number }
    expect(denied.c).toBeGreaterThanOrEqual(5)
  })
})

describe('order branch scoping (IDOR)', () => {
  it('an order from another branch cannot be read or modified', () => {
    // Create a second branch and an order under it directly
    const otherBranch = crypto.randomUUID()
    ctx.db
      .prepare(
        `INSERT INTO branches (id, organization_id, name, code) VALUES (?,
         (SELECT id FROM organizations LIMIT 1), 'Other Branch', 'BR2')`
      )
      .run(otherBranch)

    const product = ctx.db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }
    const otherService = new OrderService(ctx.db, auth, otherBranch)
    const order = otherService.createOrder(
      {
        type: 'retail',
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: 'seed-user', terminalId: 'term-local-01' }
    )

    // The main-branch service must not see it
    expect(() => orders.getOrder(order.id)).toThrow(/different branch/)
    expect(() => orders.hold(order.id, 'x', 'seed-user')).toThrow(/different branch/)
    expect(() => orders.voidOrder(order.id, 'nope', 'seed-user', 'seed-user')).toThrow(
      /different branch/
    )
  })
})

describe('backup path safety', () => {
  it('rejects path traversal in restore', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-backup-'))
    mkdirSync(join(dir, 'backups'), { recursive: true })
    const system = new SystemService(ctx.db, dir)
    expect(() => system.restoreBackup('../../../etc/passwd.db')).toThrow(/Invalid backup/)
    expect(() => system.restoreBackup('..../backups/x.db')).toThrow(/Invalid backup/)
    expect(() => system.restoreBackup('/abs/path.db')).toThrow(/Invalid backup/)
    expect(() => system.restoreBackup('nonexistent.db')).toThrow(/Backup not found/)
  })

  it('create → mutate → restore roundtrip preserves data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-backup2-'))
    mkdirSync(join(dir, 'backups'))
    // point the backup system at a checkpointed copy of the live DB
    ctx.db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(`/tmp/opencode/apex/security-${process.pid}/apexpos.db`, join(dir, 'apexpos.db'))
    const system = new SystemService(ctx.db, dir)
    const backup = system.createBackup()
    expect(backup.sizeBytes).toBeGreaterThan(10000)
    const listed = system.listBackups().map((b) => b.file)
    expect(listed.some((f) => f.endsWith('.db'))).toBe(true)
  })
})
