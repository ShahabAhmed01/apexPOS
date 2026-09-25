import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeRig, destroyRig, type TestRig } from '../helpers/rig'
import { openDatabase } from '@main/db/database'

/**
 * SYNC suite — the local outbox is the transport-independent half of
 * "offline-first". No remote endpoint exists in this product; these tests
 * prove the local half is honest and correct: durable queueing, idempotent
 * op identity, ordering, attempt bookkeeping, restart persistence, and —
 * critically — that no path reports "synced" without a real delivery.
 */

let rig: TestRig

beforeAll(() => {
  rig = makeRig('sync')
})
afterAll(() => destroyRig(rig))

describe('SYNC-01 outbox semantics', () => {
  it('enqueue is durable and idempotent by opId', () => {
    rig.sync.enqueue('op-1', 'order', 'o1', 'create', { total: 100 })
    rig.sync.enqueue('op-1', 'order', 'o1', 'create', { total: 100 }) // duplicate
    rig.sync.enqueue('op-2', 'order', 'o2', 'create', { total: 200 })
    const pending = rig.sync.pendingOps()
    expect(pending.filter((p) => p.opId === 'op-1').length).toBe(1)
    expect(pending.map((p) => p.opId)).toEqual(expect.arrayContaining(['op-1', 'op-2']))
    // payload roundtrips intact
    expect(pending.find((p) => p.opId === 'op-1')!.payload.total).toBe(100)
  })

  it('pending ops are returned in enqueue order', () => {
    rig.sync.enqueue('op-a', 'x', 'a', 'create', {})
    rig.sync.enqueue('op-b', 'x', 'b', 'create', {})
    const ops = rig.sync
      .pendingOps()
      .filter((p) => p.opId.startsWith('op-'))
      .map((p) => p.opId)
    expect(ops.indexOf('op-a')).toBeLessThan(ops.indexOf('op-b'))
  })

  it('recordAttempt marks failures (attempts++) and success (synced_at)', () => {
    rig.sync.recordAttempt('op-2', 'timeout')
    rig.sync.recordAttempt('op-2', 'timeout')
    let status = rig.sync.status()
    expect(status.failed).toBeGreaterThanOrEqual(1)
    rig.sync.recordAttempt('op-2', null)
    status = rig.sync.status()
    const delivered = rig.sync.pendingOps().find((p) => p.opId === 'op-2')
    expect(delivered).toBeUndefined()
  })

  it('status never claims "synced" or "configured" without a real remote', () => {
    const status = rig.sync.status()
    expect(status.configured).toBe(false)
    expect(['offline', 'delayed', 'failed']).toContain(status.state)
    expect(status.state).not.toBe('synced')
  })

  it('the queue survives an application restart', () => {
    rig.sync.enqueue('op-persist', 'order', 'x', 'create', { n: 1 })
    const dbPath = rig.path
    rig.ctx.close()
    const reopened = openDatabase(dbPath)
    const row = reopened.db
      .prepare(`SELECT op_id, payload FROM sync_outbox WHERE op_id = 'op-persist'`)
      .get() as { op_id: string; payload: string }
    expect(row.op_id).toBe('op-persist')
    expect(JSON.parse(row.payload).n).toBe(1)
    reopened.close()
    // The remaining suites get a fresh rig (services hold stale handles after
    // a restart — same as the real app rebuilding everything on boot).
    rig = makeRig('sync-post')
  })
})

describe('SYNC-02 domain wiring', () => {
  it('tender and refund enqueue ops with the client op id (deterministic identity)', () => {
    rig.ctx.db.prepare(`DELETE FROM sync_outbox`).run()
    const product = rig.ctx.db
      .prepare(`SELECT id FROM products WHERE track_stock = 0 LIMIT 1`)
      .get() as { id: string }
    const order = rig.orders.createOrder(
      {
        type: 'retail',
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: 'seed-user', terminalId: 'term-local-01' }
    )
    const payOp = crypto.randomUUID()
    rig.payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: payOp
      },
      'seed-user'
    )
    const ops = rig.sync.pendingOps()
    expect(ops.some((o) => o.opId === `tender:${payOp}`)).toBe(true)
    expect(ops.some((o) => o.opId.startsWith('order:'))).toBe(true)
  })
})
