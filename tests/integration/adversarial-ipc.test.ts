import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ADVERSARIAL-IPC — the renderer is treated as fully compromised.
 * Every registered channel is fuzzed with malicious shapes; the preload
 * surface is diffed against actually-registered handlers; permission and
 * lock gates are probed end-to-end through the REAL registry.
 */

// Capture every ipcMain.handle registration. Must be mocked BEFORE imports.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      handlers.set(ch, fn),
    on: () => undefined
  },
  ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  app: {
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    getPath: () => '/tmp/opencode/apex',
    relaunch: vi.fn(),
    exit: vi.fn(),
    on: vi.fn(),
    whenReady: () => Promise.resolve()
  },
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

// (vi.mock is hoisted above all imports by vitest)
import { IpcChannel } from '@shared/ipc/channels'
import { makeRig, destroyRig, type TestRig } from '../helpers/rig'
import { SessionStore } from '@main/services/sessionStore'
import { HardwareService } from '@main/hardware/hardwareService'
import { SystemService } from '@main/services/systemService'
import { SettingsService } from '@main/services/settingsService'
import { OnboardingService } from '@main/services/onboardingService'
import { RestaurantService } from '@main/services/restaurantService'
import { ReportService } from '@main/services/reportService'
import { registerAppIpc } from '@main/ipc/registerApp'
import { registerOnboardingIpc } from '@main/ipc/registerOnboarding'
import { registerAuthIpc } from '@main/ipc/registerAuth'
import { registerOrderIpc } from '@main/ipc/registerOrders'
import { registerCatalogIpc } from '@main/ipc/registerCatalog'
import { registerHardwareIpc } from '@main/ipc/registerHardware'
import { registerRestaurantIpc } from '@main/ipc/registerRestaurant'
import { registerReportsIpc } from '@main/ipc/registerReports'
import { registerCustomersIpc } from '@main/ipc/registerCustomers'
import { registerSettingsIpc } from '@main/ipc/registerSettings'
import { registerPurchasingIpc } from '@main/ipc/registerPurchasing'
import type { IpcResult } from '@shared/ipc/envelope'

let rig: TestRig
let sessionStore: SessionStore

const KNOWN_CODES = new Set([
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'INSUFFICIENT_FUNDS',
  'INSUFFICIENT_STOCK',
  'INVALID_STATE',
  'CONSTRAINT_VIOLATION',
  'HARDWARE_ERROR',
  'BACKUP_ERROR',
  'PAYMENT_DECLINED',
  'PAYMENT_TIMEOUT',
  'INTERNAL'
])

beforeEach(() => {
  handlers.clear()
  rig = makeRig('advipc')
  sessionStore = new SessionStore()
  const services: Record<string, unknown> = {
    db: rig.ctx.db,
    dataDir: rig.path.replace(/\/apexpos\.db$/, ''),
    auth: rig.auth,
    orders: rig.orders,
    payments: rig.payments,
    registers: rig.registers,
    products: rig.products,
    hardware: new HardwareService(),
    restaurant: new RestaurantService(rig.ctx.db, rig.branchId),
    reports: new ReportService(rig.ctx.db, rig.branchId),
    customers: rig.customers,
    settings: new SettingsService(rig.ctx.db),
    system: new SystemService(rig.ctx.db, rig.path.replace(/\/apexpos\.db$/, '')),
    onboarding: new OnboardingService(rig.ctx.db),
    purchasing: rig.purchasing,
    sync: rig.sync
  }
  const svc = services as never
  registerAppIpc(svc, sessionStore)
  registerOnboardingIpc(svc, sessionStore)
  registerAuthIpc(svc, sessionStore)
  registerOrderIpc(svc, sessionStore)
  registerCatalogIpc(svc, sessionStore)
  registerHardwareIpc(svc, sessionStore)
  registerRestaurantIpc(svc, sessionStore)
  registerReportsIpc(svc, sessionStore)
  registerCustomersIpc(svc, sessionStore)
  registerSettingsIpc(svc, sessionStore)
  registerPurchasingIpc(svc, sessionStore)
})

afterEach(() => {
  // Belt-and-braces: the fuzz must never corrupt the DB
  const integrity = rig.ctx.db.pragma('integrity_check', { simple: true }) as string
  expect(integrity).toBe('ok')
  const fk = rig.ctx.db.pragma('foreign_key_check') as unknown[]
  expect(fk).toHaveLength(0)
  destroyRig(rig)
})

const call = async (channel: string, ...args: unknown[]): Promise<IpcResult<unknown>> => {
  const h = handlers.get(channel)
  if (!h) throw new Error(`channel not registered: ${channel}`)
  return (await h({}, ...args)) as IpcResult<unknown>
}

/** The exact set of channels the preload layer can reach. */
const preloadChannels = (): string[] => {
  const src = readFileSync(join(__dirname, '../../src/preload/index.ts'), 'utf8')
  const names = new Set<string>()
  for (const m of src.matchAll(/IpcChannel\.(\w+)/g)) names.add(m[1]!)
  return [...names].map((n) => (IpcChannel as Record<string, string>)[n]!)
}

describe('TC-IPC-DEAD — preload surface must be 1:1 with registered handlers', () => {
  it('every channel the preload can invoke or send to is registered in main', () => {
    const missing = preloadChannels().filter((ch) => !handlers.has(ch))
    expect(missing).toEqual([])
  })
})

const GARBAGE: [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['string', 'x'],
  ['huge-string', 'A'.repeat(500_000)],
  ['empty-object', {}],
  ['array', [1, 2, 3]],
  ['nan', NaN],
  ['number', 12345],
  ['negative', -1],
  ['nested-nulls', { id: null, lines: [{ productId: null }] }],
  ['__proto__-probe', JSON.parse('{"__proto__":{"polluted":true}}')],
  ['sqli', "' OR '1'='1"],
  ['xss', '<img src=x onerror=alert(1)>'],
  ['traversal', '../../../etc/passwd']
]

describe('TC-IPC-FUZZ — unauthenticated fuzz of EVERY registered channel', () => {
  it('garbage payloads never crash the bus, never return ok, never leak internals', async () => {
    const channels = [...handlers.keys()]
    expect(channels.length).toBeGreaterThan(40)
    for (const ch of channels) {
      // skip genuinely public channels from the not-ok expectation
      const isPublicRead = [
        IpcChannel.AppInfo,
        IpcChannel.OnboardingState,
        IpcChannel.AuthSession,
        IpcChannel.AppLock,
        IpcChannel.AppRestart,
        IpcChannel.AuthLogout
      ].includes(ch as never)
      for (const [label, payload] of GARBAGE) {
        const res = await call(ch, payload)
        expect(res, `${ch} w/ ${label} must return an envelope`).toHaveProperty('ok')
        if (!res.ok) {
          expect(
            KNOWN_CODES.has(res.error.code),
            `${ch} w/ ${label}: unknown code ${res.error.code}`
          ).toBe(true)
          expect(res.error.message, `${ch} w/ ${label} leaks internals`).not.toMatch(
            /SQLITE_|sqlite|\.db\b|at Object\.|node_modules/
          )
        } else {
          expect(isPublicRead, `${ch} w/ ${label} unexpectedly succeeded unauthenticated`).toBe(
            true
          )
        }
      }
    }
    // nothing may accumulate brute-force lockout from fuzz noise on non-auth channels
    const session = rig.auth.login('cashier', 'Cashier123!')
    expect(session.user.username).toBe('cashier')
  })
})

describe('TC-IPC-AUTHZ — permission gates under a low-privilege session', () => {
  it('cashier is denied privileged mutations even with VALID-shaped payloads', async () => {
    const session = rig.auth.login('cashier', 'Cashier123!')
    sessionStore.set(session)

    const denied: [string, unknown[]][] = [
      [IpcChannel.SettingsSet, [{ key: 'app.pos', value: { allowNegativeStock: true } }]],
      [
        IpcChannel.InventoryAdjust,
        [
          {
            productId: crypto.randomUUID(),
            qtyDeltaMilli: -1000,
            reason: 'waste',
            note: 'probe',
            managerPin: '0000'
          }
        ]
      ],
      [IpcChannel.BackupRestore, [{ file: 'x.db' }]],
      [IpcChannel.BackupCreate, []],
      [IpcChannel.PurchaseOrdersCancel, [{ id: crypto.randomUUID() }]],
      [IpcChannel.OrdersVoid, [{ id: crypto.randomUUID(), reason: 'probe reason' }]]
    ]
    for (const [ch, args] of denied) {
      const res = await call(ch, ...args)
      expect(res.ok, `${ch} must be denied for cashier`).toBe(false)
      if (!res.ok) expect(['FORBIDDEN', 'UNAUTHORIZED']).toContain(res.error.code)
    }
    // the probes must not have mutated anything
    expect(
      (
        rig.ctx.db.prepare(`SELECT COUNT(*) c FROM stock_movements WHERE note = 'probe'`).get() as {
          c: number
        }
      ).c
    ).toBe(0)
  })
})

describe('TC-IPC-LOCK — a locked session is dead to IPC', () => {
  it('after lock(), privileged channels return UNAUTHORIZED until PIN-unlock', async () => {
    const session = rig.auth.login('cashier', 'Cashier123!')
    sessionStore.set(session)

    sessionStore.lock()
    // a structurally VALID payload so we pass schema validation and hit the auth gate
    const pid = firstProductId(rig.ctx.db)
    const denied = await call(IpcChannel.OrdersCreate, {
      type: 'retail',
      lines: [{ productId: pid, quantityMilli: 1000 }],
      clientOpId: crypto.randomUUID()
    })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.error.code).toBe('UNAUTHORIZED')

    // unlock via PIN login (public channel)
    const unlocked = await call(IpcChannel.AuthLoginPin, { userId: session.user.id, pin: '1234' })
    expect(unlocked.ok).toBe(true)
  })
})

describe('TC-IPC-TARGETED — high-signal attacks on money channels', () => {
  beforeEach(() => {
    sessionStore.set(rig.auth.login('admin', 'Admin123!'))
    const registerId = (
      rig.ctx.db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }
    ).id
    void registerId
  })

  const firstProduct = () =>
    rig.ctx.db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }

  it('TC-IPC-MONEY-001: MAX_SAFE_INTEGER unit price must be VALIDATION, never an INTERNAL crash', async () => {
    const res = await call(IpcChannel.OrdersCreate, {
      type: 'retail',
      lines: [
        {
          productId: firstProduct().id,
          quantityMilli: 1000,
          unitPriceOverride: Number.MAX_SAFE_INTEGER
        }
      ],
      clientOpId: crypto.randomUUID()
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('TC-IPC-MONEY-002: cart discount percent above 100% rejected at the boundary', async () => {
    const res = await call(IpcChannel.OrdersCreate, {
      type: 'retail',
      lines: [{ productId: firstProduct().id, quantityMilli: 1000 }],
      cartDiscount: { kind: 'percent', value: 20000 },
      clientOpId: crypto.randomUUID()
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('TC-IPC-MONEY-003: tender under-payment is rejected with a domain error', async () => {
    const create = await call(IpcChannel.OrdersCreate, {
      type: 'retail',
      lines: [{ productId: firstProduct().id, quantityMilli: 1000 }],
      clientOpId: crypto.randomUUID()
    })
    expect(create.ok).toBe(true)
    if (!create.ok) return
    const order = create.data as { id: string; total: number }
    const res = await call(IpcChannel.PaymentsTender, {
      orderId: order.id,
      payments: [{ method: 'cash', amount: order.total - 1 }],
      clientOpId: crypto.randomUUID()
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('TC-IPC-SEC-001: path traversal in backup restore is rejected', async () => {
    const res = await call(IpcChannel.BackupRestore, { file: '../../../etc/passwd' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
    const hidden = await call(IpcChannel.BackupRestore, { file: '..\\..\\windows\\system32\\x.db' })
    expect(hidden.ok).toBe(false)
  })

  it('TC-IPC-SEC-002: SQL-injection search strings return safely and leave tables intact', async () => {
    for (const probe of [
      `' OR 1=1--`,
      `"; DROP TABLE products;--`,
      `%\\_%`,
      `\\`,
      `\`; ATTACH DATABASE '/etc/passwd' AS x;--`
    ]) {
      const r = await call(IpcChannel.ProductsSearch, { term: probe })
      expect(r.ok).toBe(true)
      if (r.ok) expect(Array.isArray(r.data)).toBe(true)
    }
    const tables = rig.ctx.db
      .prepare(`SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='products'`)
      .get() as { c: number }
    expect(tables.c).toBe(1)
  })

  it('TC-IPC-SEC-003: settings writes are schema-enforced even with admin', async () => {
    const bad = await call(IpcChannel.SettingsSet, { key: 'app.pos', value: { mode: 'surprise' } })
    expect(bad.ok).toBe(false)
    const unknown = await call(IpcChannel.SettingsSet, { key: 'app.does-not-exist', value: 1 })
    expect(unknown.ok).toBe(false)
  })
})

describe('TC-IPC-E2E-TRUTH — a real sale over the wire reconciles', () => {
  it('create → tender over IPC matches SQL truth exactly', async () => {
    sessionStore.set(rig.auth.login('manager', 'Manager123!'))
    const db = rig.ctx.db
    const registerId = (db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
    await call(IpcChannel.RegisterOpen, { registerId, openingFloat: 2000000 })
    const pid = firstProductId(db)
    const create = await call(IpcChannel.OrdersCreate, {
      type: 'retail',
      registerId,
      lines: [{ productId: pid, quantityMilli: 2000 }],
      clientOpId: crypto.randomUUID()
    })
    expect(create.ok).toBe(true)
    if (!create.ok) return
    const order = create.data as { id: string; total: number }
    const tender = await call(IpcChannel.PaymentsTender, {
      orderId: order.id,
      payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
      clientOpId: crypto.randomUUID()
    })
    expect(tender.ok).toBe(true)
    // SQL truth
    const row = db.prepare(`SELECT total, status FROM orders WHERE id = ?`).get(order.id) as {
      total: number
      status: string
    }
    expect(row.status).toBe('completed')
    const paySum = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) s FROM payments WHERE order_id = ? AND status='approved'`
      )
      .get(order.id) as { s: number }
    expect(paySum.s).toBe(order.total)
    expect(row.total).toBe(order.total)
  })
})

const firstProductId = (db: TestRig['ctx']['db']): string =>
  (db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }).id
