import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeRig, destroyRig, type TestRig } from '../helpers/rig'
import { PurchaseService } from '@main/services/purchaseService'

/**
 * PUR-*  Purchasing lifecycle: draft → sent → partial → partial → received,
 * over-receive rejection, cancellation rules, idempotent receiving,
 * weighted-average costing, stock-ledger integration, audit.
 */

let rig: TestRig
let supplierId: string
let productId: string
const U = 'seed-user'

beforeAll(() => {
  rig = makeRig('purchasing')
  supplierId = (rig.ctx.db.prepare('SELECT id FROM suppliers LIMIT 1').get() as { id: string }).id
  productId = (
    rig.ctx.db.prepare('SELECT id FROM products WHERE track_stock = 1 LIMIT 1').get() as {
      id: string
    }
  ).id
})
afterAll(() => destroyRig(rig))

const onHand = (pid: string): number =>
  (
    rig.ctx.db
      .prepare(
        'SELECT COALESCE(SUM(qty_delta),0) q FROM stock_movements WHERE product_id = ? AND branch_id = ?'
      )
      .get(pid, rig.branchId) as { q: number }
  ).q

describe('PUR-01 lifecycle invariants', () => {
  it('rejects invalid input (no items / bad qty / unknown product)', () => {
    expect(() => rig.purchasing.createPO({ supplierId, items: [] }, U)).toThrow(/at least one/)
    expect(() =>
      rig.purchasing.createPO({ supplierId, items: [{ productId, qtyMilli: 0, unitCost: 100 }] }, U)
    ).toThrow(/positive/)
    expect(() =>
      rig.purchasing.createPO(
        { supplierId, items: [{ productId: crypto.randomUUID(), qtyMilli: 1000, unitCost: 100 }] },
        U
      )
    ).toThrow(/Product not found/)
    expect(() =>
      rig.purchasing.createPO(
        { supplierId: crypto.randomUUID(), items: [{ productId, qtyMilli: 1000, unitCost: 100 }] },
        U
      )
    ).toThrow(/Supplier not found/)
  })

  it('full lifecycle: draft → sent → partial receives → received', () => {
    const before = onHand(productId)
    const po = rig.purchasing.createPO(
      {
        supplierId,
        notes: 'lifecycle test',
        items: [{ productId, qtyMilli: 5000, unitCost: 10000 }]
      },
      U
    )
    expect(po.status).toBe('draft')
    expect(po.number).toBeGreaterThan(0)

    // Cannot receive from draft
    expect(() => rig.purchasing.receivePO(po.id, [], U)).toThrow(/cannot receive/i)

    const sent = rig.purchasing.sendPO(po.id, U)
    expect(sent.status).toBe('sent')
    // Sending twice is rejected
    expect(() => rig.purchasing.sendPO(po.id, U)).toThrow(/not draft/)

    const itemId = rig.purchasing.getPO(po.id).items[0]!.id
    // partial receive 2 units
    let cur = rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 2000 }], U, 'pur-op-1')
    expect(cur.status).toBe('partial')
    expect(cur.items[0]!.qtyReceived).toBe(2000)
    expect(onHand(productId)).toBe(before + 2000)

    // over-receive rejected
    expect(() =>
      rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 3001 }], U, crypto.randomUUID())
    ).toThrow(/Over-receiving/)

    // remaining 3 units
    cur = rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 3000 }], U, 'pur-op-2')
    expect(cur.status).toBe('received')
    expect(cur.items[0]!.qtyReceived).toBe(5000)
    expect(onHand(productId)).toBe(before + 5000)

    // further receive on a received PO is rejected
    expect(() =>
      rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 1000 }], U, crypto.randomUUID())
    ).toThrow(/cannot receive/)

    // stock ledger: exactly two receive movements for this PO
    const refs = rig.ctx.db
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(qty_delta),0) s FROM stock_movements
         WHERE ref_type = 'purchase_order' AND ref_id = ?`
      )
      .get(po.id) as { c: number; s: number }
    expect(refs.c).toBe(2)
    expect(refs.s).toBe(5000)
  })

  it('idempotent receive: same clientOpId is a no-op', () => {
    const po = rig.purchasing.createPO(
      { supplierId, items: [{ productId, qtyMilli: 2000, unitCost: 10000 }] },
      U
    )
    rig.purchasing.sendPO(po.id, U)
    const itemId = rig.purchasing.getPO(po.id).items[0]!.id
    const before = onHand(productId)
    const op = crypto.randomUUID()
    rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 1000 }], U, op)
    rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 1000 }], U, op) // retry
    rig.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 1000 }], U, op) // duplicate retry
    expect(rig.purchasing.getPO(po.id).items[0]!.qtyReceived).toBe(1000)
    expect(onHand(productId)).toBe(before + 1000)
  })

  it('weighted-average cost follows received stock', () => {
    // Fresh product with zero stock: first receive sets cost; a second
    // receive at a different price moves it to the weighted average.
    const unit = rig.ctx.db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
    const pid = crypto.randomUUID()
    const t = new Date().toISOString()
    rig.ctx.db
      .prepare(
        `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
         VALUES (?, ?, 'WAC item', ?, 0, 0, 1, 1, ?, ?)`
      )
      .run(pid, `WAC-${pid.slice(0, 6)}`, unit.id, t, t)

    const po = rig.purchasing.createPO(
      {
        supplierId,
        items: [
          { productId: pid, qtyMilli: 10000, unitCost: 10000 }, // 10 @ 100.00
          { productId: pid, qtyMilli: 10000, unitCost: 20000 } // 10 @ 200.00
        ]
      },
      U
    )
    rig.purchasing.sendPO(po.id, U)
    const items = rig.purchasing.getPO(po.id).items
    const cheap = items.find((i) => i.unitCost === 10000)!
    const dear = items.find((i) => i.unitCost === 20000)!
    rig.purchasing.receivePO(po.id, [{ itemId: cheap.id, qtyMilli: 10000 }], U, 'wac-1')
    let cost = (
      rig.ctx.db.prepare('SELECT cost FROM products WHERE id = ?').get(pid) as { cost: number }
    ).cost
    expect(cost).toBe(10000) // empty stock → receipt cost
    rig.purchasing.receivePO(po.id, [{ itemId: dear.id, qtyMilli: 10000 }], U, 'wac-2')
    cost = (
      rig.ctx.db.prepare('SELECT cost FROM products WHERE id = ?').get(pid) as { cost: number }
    ).cost
    // (10 × 100.00 + 10 × 200.00) / 20 = 150.00
    expect(cost).toBe(15000)
    cost = (
      rig.ctx.db.prepare('SELECT cost FROM products WHERE id = ?').get(pid) as { cost: number }
    ).cost
    expect(cost).toBe(15000)
  })

  it('cancellation rules: allowed from draft/sent, forbidden after receiving', () => {
    const purch = (p: (s: PurchaseService) => unknown): unknown => p(rig.purchasing)
    void purch
    const draft = rig.purchasing.createPO(
      { supplierId, items: [{ productId, qtyMilli: 1000, unitCost: 10000 }] },
      U
    )
    rig.purchasing.cancelPO(draft.id, U)
    expect(rig.purchasing.getPO(draft.id).status).toBe('cancelled')
    // idempotent cancel
    rig.purchasing.cancelPO(draft.id, U)

    const sent = rig.purchasing.createPO(
      { supplierId, items: [{ productId, qtyMilli: 1000, unitCost: 10000 }] },
      U
    )
    rig.purchasing.sendPO(sent.id, U)
    rig.purchasing.cancelPO(sent.id, U)
    expect(rig.purchasing.getPO(sent.id).status).toBe('cancelled')

    const received = rig.purchasing.createPO(
      { supplierId, items: [{ productId, qtyMilli: 1000, unitCost: 10000 }] },
      U
    )
    rig.purchasing.sendPO(received.id, U)
    const it = rig.purchasing.getPO(received.id).items[0]!.id
    rig.purchasing.receivePO(received.id, [{ itemId: it, qtyMilli: 1000 }], U, 'cxl-1')
    expect(() => rig.purchasing.cancelPO(received.id, U)).toThrow(/cannot be cancelled/)
  })

  it('writes an audit entry for create/send/receive/cancel', () => {
    const po = rig.purchasing.createPO(
      { supplierId, items: [{ productId, qtyMilli: 1000, unitCost: 10000 }] },
      U
    )
    rig.purchasing.sendPO(po.id, U)
    const items = rig.purchasing.getPO(po.id).items
    rig.purchasing.receivePO(po.id, [{ itemId: items[0]!.id, qtyMilli: 1000 }], U, 'aud-1')
    const actions = rig.ctx.db
      .prepare(
        `SELECT action FROM audit_log WHERE entity = 'purchase_order' AND entity_id = ? ORDER BY created_at`
      )
      .all(po.id) as { action: string }[]
    expect(actions.map((a) => a.action)).toEqual(['po.create', 'po.send', 'po.receive'])
  })

  it('supplier CRUD + search', () => {
    const s = rig.purchasing.saveSupplier({ name: 'Suite Test Supplier', phone: '000' }, U)
    const found = rig.purchasing.listSuppliers('Suite Test')
    expect(found.some((x) => x.id === s.id)).toBe(true)
    const renamed = rig.purchasing.saveSupplier({ id: s.id, name: 'Suite Renamed' }, U)
    expect(renamed.name).toBe('Suite Renamed')
    expect(() => rig.purchasing.saveSupplier({ name: '  ' }, U)).toThrow(/required/)
  })
})
