import { test, expect } from '@playwright/test'
import {
  launchT,
  login,
  openDb,
  q,
  q1,
  closeApp,
  shot,
  log,
  perf,
  dbHealth,
  addProduct,
  gotoFloor,
  tableBtn,
  tableAria,
  isFreeAria,
  waitForTableAria,
  seatTable,
  openTableOrder,
  sendToKitchen,
  tableIds,
  activeOrders,
  idOf,
  need,
  type Db
} from './_util'

/**
 * §44-§49 LIVE RESTAURANT TORTURE.
 * Floor plan, tables, KDS, split bill, transfer, merge.
 * DB triangulation: restaurant_tables, orders, order_lines, payments.
 *
 * Every flow goes through the real UI. The floor canvas is absolutely
 * positioned (no `.grid`), tiles are addressed by
 * `aria-label="Table <name>, <status>"`, seating happens in a side detail
 * panel (there is no open-table dialog), and the POS product grid is capped
 * at 20 rows — so every product pick goes through `addProduct` (search first).
 */

/** Active dine-in orders, joined to their table name. */
const activeDineIns = (db: Db) =>
  q<{ name: string; status: string; total: number; table_id: string }>(
    db,
    `SELECT rt.name, o.status, o.total, o.table_id
       FROM orders o JOIN restaurant_tables rt ON rt.id = o.table_id
      WHERE o.type = 'dine_in' AND o.status NOT IN ('completed', 'void')
      ORDER BY rt.name`
  )

/** Line names on a table's current (non-closed) order. */
const linesOnTable = (db: Db, tableId: string) =>
  q<{ name: string; status: string }>(
    db,
    `SELECT ol.name, ol.status
       FROM order_lines ol JOIN orders o ON o.id = ol.order_id
      WHERE o.table_id = ? AND o.status NOT IN ('completed', 'void')
      ORDER BY ol.sort_order, ol.name`,
    tableId
  )

test.describe('floor plan → table lifecycle', () => {
  test('seat guests at free table → order loads in POS → pay → table frees', async () => {
    const startedAt = new Date().toISOString()
    const { app, dir } = await launchT({ label: 'dinein-full' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    const before = await tableAria(page, 'T-1')
    log({ test: 'dinein-full', before })
    expect(isFreeAria(before)).toBe(true)

    await seatTable(page, 'T-1', 2)
    log({ test: 'dinein-full', seatUrl: page.url() })
    await shot(page, 'dinein-after-seat')

    await expect(page.locator('text=Current Sale')).toBeVisible({ timeout: 15_000 })
    // The dine-in banner proves the TABLE's order was loaded, not a new one.
    await expect(page.locator('text=table order')).toBeVisible({ timeout: 15_000 })

    // Product grid is LIMIT 20 — always search before clicking.
    await addProduct(page, 'Coca-Cola 500ml PET')
    await addProduct(page, 'Lays Salted 40g')
    await expect(page.locator('ul li')).toHaveCount(2)

    const t0 = Date.now()
    await page.click('button:has-text("Charge")')
    await page.waitForSelector('text=Payment complete', { timeout: 15_000 })
    perf({ metric: 'dinein-seat-to-payment', ms: Date.now() - t0, lines: 2 })
    await shot(page, 'dinein-full-receipt')
    await page.click('[role=dialog] button:has-text("Done")')

    const after = await tableAria(page, 'T-1')
    log({ test: 'dinein-full', after })
    expect(isFreeAria(after)).toBe(true)

    // DB truth: the dine-in order completed AND kept its table_id (LT-007).
    expect(dbHealth(db).integrity).toBe('ok')
    expect(dbHealth(db).fk).toHaveLength(0)
    const order = q1<{
      table_id: string | null
      status: string
      total: number
      number_label: string
    }>(
      db,
      `SELECT table_id, status, total, number_label FROM orders
        WHERE type = 'dine_in' AND status = 'completed' AND completed_at >= ?
        ORDER BY completed_at DESC LIMIT 1`,
      startedAt
    )
    log({ test: 'dinein-final-order', order })
    expect(order, 'a dine-in order must have completed during this test').toBeTruthy()
    expect(order.status).toBe('completed')
    expect(order.table_id, 'table_id must survive checkout (LT-007)').toBeTruthy()
    expect(order.total).toBeGreaterThan(0)

    db.close()
    await closeApp(app)
  })

  test('multiple tables occupied simultaneously', async () => {
    const { app, dir } = await launchT({ label: 'dinein-multi' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    await seatTable(page, 'T-1', 2)
    await seatTable(page, 'T-2', 4)

    const a1 = await tableAria(page, 'T-1')
    const a2 = await tableAria(page, 'T-2')
    log({ test: 'dinein-multi', a1, a2 })
    expect(isFreeAria(a1)).toBe(false)
    expect(isFreeAria(a2)).toBe(false)
    expect(activeDineIns(db)).toHaveLength(2)

    // Settle T-1 and pay it; T-2 must stay occupied throughout.
    await openTableOrder(page, 'T-1')
    await addProduct(page, 'Sprite 1.5L')
    await expect(page.locator('ul li')).toHaveCount(1)
    await page.click('button:has-text("Charge")')
    await page.waitForSelector('text=Payment complete', { timeout: 15_000 })
    await page.click('[role=dialog] button:has-text("Done")')

    const a1b = await tableAria(page, 'T-1')
    const a2b = await tableAria(page, 'T-2')
    log({ test: 'dinein-multi-after', a1b, a2b })
    expect(isFreeAria(a1b)).toBe(true)
    expect(isFreeAria(a2b)).toBe(false)

    const remaining = activeDineIns(db)
    log({ test: 'dinein-multi-remaining', remaining })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.name).toBe('T-2')
    expect(remaining[0]?.status).toBe('open')

    db.close()
    await closeApp(app)
  })

  test('floor plan: no two tables overlap, every patio tile is clickable', async () => {
    const { app, dir } = await launchT({ label: 'floor-layout' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    const tables = q<{ name: string; x: number; y: number; w: number; h: number }>(
      db,
      'SELECT name, x, y, w, h FROM restaurant_tables ORDER BY name'
    )
    log({ test: 'floor-layout', count: tables.length })
    expect(tables.length).toBeGreaterThanOrEqual(10)

    // LT-011: the patio was seeded at (60,60)/(200,60), directly on top of
    // T-1/T-2. In the default all-zones view the hall tile painted OVER the
    // patio tile, so P-1 could never be clicked (sale-flow.spec.ts hid this
    // with click({ force: true })).
    const overlaps: string[] = []
    for (let i = 0; i < tables.length; i++) {
      const a = tables[i]
      if (!a) continue
      for (let j = i + 1; j < tables.length; j++) {
        const b = tables[j]
        if (!b) continue
        const disjoint =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        if (!disjoint) overlaps.push(`${a.name}/${b.name}`)
      }
    }
    log({ test: 'floor-layout-overlaps', overlaps })
    expect(overlaps, `overlapping tables: ${overlaps.join(', ')}`).toHaveLength(0)

    // And the rendered tile must actually take the click.
    for (const name of ['P-1', 'P-2']) {
      await gotoFloor(page)
      await tableBtn(page, name).click()
      await expect(page.locator('button:has-text("Seat party of")')).toBeVisible({
        timeout: 5_000
      })
    }

    db.close()
    await closeApp(app)
  })
})

test.describe('table operations torture (§45-§46)', () => {
  test('transfer table: move entire order to free table', async () => {
    const { app, dir } = await launchT({ label: 'table-transfer' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    const ids = await tableIds(page)

    // A transfer TARGET must be free — only seat the source table.
    expect(isFreeAria(await tableAria(page, 'T-4'))).toBe(true)

    await seatTable(page, 'T-3', 2)
    await addProduct(page, 'Chicken Karahi (Half)')
    await sendToKitchen(page)

    // Transfer through the real modal (select values are UUIDs).
    await gotoFloor(page)
    await tableBtn(page, 'T-3').click()
    await page.click('button:has-text("Transfer table")')
    await page.locator('[role=dialog] select').selectOption(idOf(ids, 'T-4'))
    await page.locator('[role=dialog] button:has-text("Confirm")').click()
    await page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15_000 })

    const a3 = await tableAria(page, 'T-3')
    const a4 = await tableAria(page, 'T-4')
    log({ test: 'transfer', a3, a4 })
    expect(isFreeAria(a3)).toBe(true)
    expect(isFreeAria(a4)).toBe(false)

    const remaining = activeDineIns(db)
    log({ test: 'transfer-remaining', remaining })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.name).toBe('T-4')
    expect(remaining[0]?.table_id).toBe(idOf(ids, 'T-4'))
    expect(remaining[0]?.status).toBe('sent_to_kitchen')
    expect(remaining[0]?.total).toBeGreaterThan(0)
    expect(linesOnTable(db, idOf(ids, 'T-4')).map((l) => l.name)).toEqual(['Chicken Karahi (Half)'])
    expect(dbHealth(db).integrity).toBe('ok')

    db.close()
    await closeApp(app)
  })

  test('move lines / split bill between two occupied tables', async () => {
    const { app, dir } = await launchT({ label: 'table-move-lines' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    await seatTable(page, 'T-5', 2)
    await addProduct(page, 'Chicken Biryani')
    await addProduct(page, 'Daal Mash Makhani')
    await addProduct(page, 'Naan (Plain)')
    await expect(page.locator('ul li')).toHaveCount(3)
    await sendToKitchen(page)

    await seatTable(page, 'T-6', 2)
    await addProduct(page, 'Club Sandwich')
    await addProduct(page, 'Zinger Burger')
    await expect(page.locator('ul li')).toHaveCount(2)
    await sendToKitchen(page)

    const ids = await tableIds(page)
    expect(linesOnTable(db, idOf(ids, 'T-5'))).toHaveLength(3)
    expect(linesOnTable(db, idOf(ids, 'T-6'))).toHaveLength(2)

    const srcOrder = need((await activeOrders(page))['T-5'], 'T-5 active order id')
    const moveRes = await page.evaluate(`(async () => {
      const o5 = await window.api.orders.get('${srcOrder}');
      const daal = o5.data.lines.find(l => l.name.includes('Daal'));
      if (!daal) return { ok: false, error: { code: 'HARNESS', message: 'daal not on T-5' } };
      return await window.api.tables.moveLines('${srcOrder}', [daal.id], '${idOf(ids, 'T-6')}');
    })()`)
    log({ test: 'move-lines', moveRes })
    expect((moveRes as { ok: boolean }).ok).toBe(true)

    // DB triangulation: exactly one Daal line, now owned by T-6's order.
    const daal = q1<{ table_id: string; status: string }>(
      db,
      `SELECT o.table_id, ol.status FROM order_lines ol JOIN orders o ON o.id = ol.order_id
        WHERE ol.name LIKE 'Daal%' AND o.status NOT IN ('completed','void')`
    )
    log({ test: 'move-lines-daal', daal })
    expect(daal.table_id).toBe(idOf(ids, 'T-6'))
    expect(daal.status).toBe('fired')
    expect(linesOnTable(db, idOf(ids, 'T-5')).map((l) => l.name)).toEqual([
      'Chicken Biryani',
      'Naan (Plain)'
    ])
    expect(linesOnTable(db, idOf(ids, 'T-6')).map((l) => l.name)).toEqual([
      'Club Sandwich',
      'Zinger Burger',
      'Daal Mash Makhani'
    ])

    // Both tables must still be occupied (split leaves the source alive).
    const a5 = await waitForTableAria(page, 'T-5', (a) => !isFreeAria(a))
    const a6 = await waitForTableAria(page, 'T-6', (a) => !isFreeAria(a))
    log({ test: 'move-lines-after', a5, a6 })
    expect(isFreeAria(a5)).toBe(false)
    expect(isFreeAria(a6)).toBe(false)
    expect(dbHealth(db).fk).toHaveLength(0)

    db.close()
    await closeApp(app)
  })

  test('merge tables: combine orders onto one table, other frees', async () => {
    const { app, dir } = await launchT({ label: 'table-merge' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    await seatTable(page, 'P-1', 4)
    await addProduct(page, 'Chicken Biryani')
    await sendToKitchen(page)

    await seatTable(page, 'P-2', 4)
    await addProduct(page, 'Club Sandwich')
    await sendToKitchen(page)

    const ids = await tableIds(page)
    expect(activeDineIns(db)).toHaveLength(2)

    const srcOrder = need((await activeOrders(page))['P-1'], 'P-1 active order id')
    const mergeRes = await page.evaluate(
      `window.api.tables.merge('${srcOrder}', '${idOf(ids, 'P-2')}')`
    )
    log({ test: 'merge-p1-p2', mergeRes })
    expect((mergeRes as { ok: boolean }).ok).toBe(true)

    const ap1 = await waitForTableAria(page, 'P-1', (a) => a.endsWith(', free'))
    const ap2 = await waitForTableAria(page, 'P-2', (a) => !isFreeAria(a))
    log({ test: 'merge-after', ap1, ap2 })
    expect(isFreeAria(ap1)).toBe(true)
    expect(isFreeAria(ap2)).toBe(false)

    // The emptied source shell is voided, the target keeps BOTH orders' lines.
    const p1Order = q1<{ status: string }>(
      db,
      `SELECT status FROM orders WHERE table_id = ? ORDER BY created_at DESC LIMIT 1`,
      idOf(ids, 'P-1')
    )
    expect(p1Order.status).toBe('void')
    expect(linesOnTable(db, idOf(ids, 'P-1'))).toHaveLength(0)
    expect(
      linesOnTable(db, idOf(ids, 'P-2'))
        .map((l) => l.name)
        .sort()
    ).toEqual(['Chicken Biryani', 'Club Sandwich'])
    expect(activeDineIns(db)).toHaveLength(1)
    expect(dbHealth(db).integrity).toBe('ok')
    expect(dbHealth(db).fk).toHaveLength(0)

    db.close()
    await closeApp(app)
  })

  test('request bill + split bill combinatorics (2/3/4-way)', async () => {
    const { app, dir } = await launchT({ label: 'split-bill' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    const ids = await tableIds(page)

    await seatTable(page, 'T-7', 4)
    for (const p of ['Chicken Biryani', 'Daal Mash Makhani', 'Naan (Plain)', 'Fresh Lime Soda'])
      await addProduct(page, p)
    await expect(page.locator('ul li')).toHaveCount(4)
    await sendToKitchen(page)

    const orders = await activeOrders(page)
    const orderId = orders['T-7']
    log({ test: 'split-bill', orderId })
    expect(orderId, 'T-7 must own an active order').toBeTruthy()

    // Request the bill: sent_to_kitchen → billed, table status → bill.
    await gotoFloor(page)
    await tableBtn(page, 'T-7').click()
    await page.click('button:has-text("Request bill")')
    const billedAria = await waitForTableAria(page, 'T-7', (a) => a.endsWith(', bill'))
    log({ test: 'split-bill-aria', billedAria })
    expect(billedAria).toContain(', bill')

    // Split 2 of the 4 lines onto a free table (4-way → 2 + 2).
    await tableBtn(page, 'T-7').click()
    await page.click('button:has-text("Move items / split bill")')
    const boxes = page.locator('[role=dialog] input[type=checkbox]')
    await page.waitForSelector('[role=dialog] input[type=checkbox]', { timeout: 10_000 })
    await expect(boxes).toHaveCount(4)
    await boxes.nth(0).check()
    await boxes.nth(1).check()
    await page.locator('[role=dialog] select').selectOption(idOf(ids, 'T-8'))
    await page.locator('[role=dialog] button:has-text("Move 2 items")').click()
    await page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15_000 })
    await shot(page, 'split-bill-done')

    const src = q1<{ status: string; lines: number }>(
      db,
      `SELECT o.status, (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) lines
         FROM orders o WHERE o.table_id = ? AND o.status NOT IN ('completed','void')`,
      idOf(ids, 'T-7')
    )
    const dst = q1<{ status: string; lines: number }>(
      db,
      `SELECT o.status, (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) lines
         FROM orders o WHERE o.table_id = ? AND o.status NOT IN ('completed','void')`,
      idOf(ids, 'T-8')
    )
    log({ test: 'split-bill-db', src, dst })
    // Split leaves the billed source alive with half its lines.
    expect(src.status).toBe('billed')
    expect(src.lines).toBe(2)
    expect(dst.lines).toBe(2)
    expect(dst.status).toBe('open')
    expect(dbHealth(db).integrity).toBe('ok')
    expect(dbHealth(db).fk).toHaveLength(0)

    db.close()
    await closeApp(app)
  })
})

test.describe('KDS torture (§48)', () => {
  test('ticket creation → bump → recall via live KDS screen', async () => {
    const { app, dir } = await launchT({ label: 'kds-basic' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    // Fresh board is empty — nothing has been fired yet.
    await page.click('a[href="#/kitchen"]')
    await expect(page.locator('text=Kitchen Display')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=No orders in the kitchen right now')).toBeVisible({
      timeout: 10_000
    })

    // Seat, ring in, and FIRE the order (the missing product path, LT-008).
    await seatTable(page, 'T-1', 2)
    await addProduct(page, 'Chicken Biryani')
    await addProduct(page, 'Daal Mash Makhani')
    await expect(page.locator('ul li')).toHaveCount(2)
    await sendToKitchen(page)

    // The ticket must appear on the board.
    await page.click('a[href="#/kitchen"]')
    await expect(page.locator('text=Chicken Biryani').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Daal Mash Makhani').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=1 active tickets')).toBeVisible({ timeout: 5_000 })
    await shot(page, 'kds-ticket-live')

    // Bump → gone from the board, order lands in `served`.
    await page.click('button:has-text("Bump — mark served")')
    await expect(page.locator('text=Chicken Biryani')).toHaveCount(0, { timeout: 10_000 })
    const bumped = q1<{ status: string }>(
      db,
      `SELECT status FROM orders WHERE table_id IS NOT NULL AND type='dine_in'
        ORDER BY created_at DESC LIMIT 1`
    )
    expect(bumped.status).toBe('served')

    // Recall → back on the board (declared channel, now wired).
    const orders = await activeOrders(page)
    expect(orders['T-1']).toBeTruthy()
    const recallRes = (await page.evaluate(`window.api.kitchen.recall('${orders['T-1']}')`)) as {
      ok: boolean
    }
    log({ test: 'kds-recall', recallRes })
    expect(recallRes.ok).toBe(true)
    await expect(page.locator('text=Chicken Biryani').first()).toBeVisible({ timeout: 15_000 })

    // Bump again → empty once more (recall is not a stuck state).
    await page.click('button:has-text("Bump — mark served")')
    await expect(page.locator('text=Chicken Biryani')).toHaveCount(0, { timeout: 10_000 })

    expect(dbHealth(db).integrity).toBe('ok')
    db.close()
    await closeApp(app)
  })

  test('kitchen role lands with a usable KDS and least-privilege nav', async () => {
    const { app } = await launchT({ label: 'kds-role' })
    const page = await login(app, 'kitchen')

    // The kitchen role must be able to reach its own board.
    await expect(page.locator('a[href="#/kitchen"]')).toHaveCount(1)
    // …and must NOT be handed floor-plan / table authority it does not have.
    await expect(page.locator('a[href="#/floor"]')).toHaveCount(0)

    await page.click('a[href="#/kitchen"]')
    await expect(page.locator('text=Kitchen Display')).toBeVisible({ timeout: 10_000 })

    await closeApp(app)
  })
})

test.describe('concurrent table operations (§46 multi-terminal)', () => {
  test('two waiters on different tables - no cross-contamination', async () => {
    // Both instances share ONE data dir → genuinely concurrent terminals.
    const { app: app1, dir } = await launchT({ label: 'concurrent-w1' })
    const db = openDb(dir)
    const page1 = await login(app1, 'waiter')
    const { app: app2 } = await launchT({ label: 'concurrent-w2', dir })
    const page2 = await login(app2, 'waiter')

    // Regression for LT-009: a waiter MUST be able to seat a table.
    await seatTable(page1, 'T-1', 2)
    await addProduct(page1, 'Chicken Biryani')
    await sendToKitchen(page1)

    await seatTable(page2, 'T-2', 2)
    await addProduct(page2, 'Club Sandwich')
    await sendToKitchen(page2)

    // Both terminals converge on the same shared truth.
    const a1 = await waitForTableAria(page1, 'T-1', (a) => !isFreeAria(a))
    const a2 = await waitForTableAria(page2, 'T-2', (a) => !isFreeAria(a))
    const cross1 = await waitForTableAria(page1, 'T-2', (a) => !isFreeAria(a))
    const cross2 = await waitForTableAria(page2, 'T-1', (a) => !isFreeAria(a))
    log({ test: 'concurrent-waiters', a1, a2, cross1, cross2 })
    expect(isFreeAria(a1)).toBe(false)
    expect(isFreeAria(a2)).toBe(false)
    expect(isFreeAria(cross1)).toBe(false)
    expect(isFreeAria(cross2)).toBe(false)

    // No line may leak from one waiter's order into the other's.
    const ids = await tableIds(page1)
    expect(linesOnTable(db, idOf(ids, 'T-1')).map((l) => l.name)).toEqual(['Chicken Biryani'])
    expect(linesOnTable(db, idOf(ids, 'T-2')).map((l) => l.name)).toEqual(['Club Sandwich'])
    expect(activeDineIns(db)).toHaveLength(2)
    expect(dbHealth(db).integrity).toBe('ok')
    expect(dbHealth(db).fk).toHaveLength(0)

    await closeApp(app1)
    await closeApp(app2)
  })

  test('waiter B cannot transfer waiter A table - forbidden, state unchanged', async () => {
    const { app: app1, dir } = await launchT({ label: 'concurrent-w1-edit' })
    const db = openDb(dir)
    const page1 = await login(app1, 'waiter')
    const { app: app2 } = await launchT({ label: 'concurrent-w2-transfer', dir })
    const page2 = await login(app2, 'waiter')

    // A seats and fires a table.
    await seatTable(page1, 'T-3', 2)
    await addProduct(page1, 'Chicken Biryani')
    await sendToKitchen(page1)
    const ids = await tableIds(page1)
    const ordersBefore = await activeOrders(page1)
    const beforeLines = linesOnTable(db, idOf(ids, 'T-3'))
    expect(beforeLines).toHaveLength(1)

    // B opens the same table: the transfer affordance must not exist at all
    // (waiters have no `tables.transfer`).
    await gotoFloor(page2)
    await tableBtn(page2, 'T-3').click()
    await expect(page2.locator('button:has-text("View / add to order")')).toHaveCount(1)
    await expect(page2.locator('button:has-text("Transfer table")')).toHaveCount(0)
    await expect(page2.locator('button:has-text("Move items / split bill")')).toHaveCount(0)
    await expect(page2.locator('button:has-text("Merge into another table")')).toHaveCount(0)

    // A compromised renderer pushing the raw channel must be rejected.
    const res = (await page2.evaluate(`(async () => {
      const tables = (await window.api.floors.tables()).data;
      const t3 = tables.find(t => t.name === 'T-3' && t.activeOrderId);
      const free = tables.find(t => t.status === 'free' && t.name !== 'T-3');
      if (!t3 || !free) return { ok: false, error: { code: 'HARNESS', message: 'tables not ready' } };
      return await window.api.tables.transfer(t3.activeOrderId, free.id);
    })()`)) as { ok: boolean; error?: { code: string; message: string } }
    log({ test: 'concurrent-transfer-forbidden', res })
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('FORBIDDEN')

    // Nothing moved, nothing duplicated, nothing lost.
    const ordersAfter = await activeOrders(page1)
    expect(Object.keys(ordersAfter)).toEqual(['T-3'])
    expect(ordersAfter['T-3']).toBe(ordersBefore['T-3'])
    expect(linesOnTable(db, idOf(ids, 'T-3')).map((l) => l.name)).toEqual(['Chicken Biryani'])
    expect(activeDineIns(db)).toHaveLength(1)
    expect(dbHealth(db).integrity).toBe('ok')

    await closeApp(app1)
    await closeApp(app2)
  })

  test('manager transfers the table a waiter is actively editing - no lost lines', async () => {
    const { app: app1, dir } = await launchT({ label: 'race-waiter' })
    const db = openDb(dir)
    const page1 = await login(app1, 'waiter')
    const { app: app2 } = await launchT({ label: 'race-manager', dir })
    const page2 = await login(app2, 'manager')

    // Waiter seats, rings in the first item, and re-opens the order in POS.
    await seatTable(page1, 'T-5', 2)
    await addProduct(page1, 'Chicken Biryani')
    await sendToKitchen(page1)
    await openTableOrder(page1, 'T-5')
    const ids = await tableIds(page1)
    const ordersBefore = await activeOrders(page1)

    // Manager transfers T-5 → T-6 while the waiter still holds the order.
    await gotoFloor(page2)
    await tableBtn(page2, 'T-5').click()
    await page2.click('button:has-text("Transfer table")')
    await page2.locator('[role=dialog] select').selectOption(idOf(ids, 'T-6'))
    await page2.locator('[role=dialog] button:has-text("Confirm")').click()
    await page2.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15_000 })

    // The waiter's next write must land on the SAME order, now at T-6.
    await addProduct(page1, 'Club Sandwich')
    await expect(page1.locator('ul li')).toHaveCount(2)
    await sendToKitchen(page1)

    const ordersAfter = await activeOrders(page1)
    expect(ordersAfter['T-6']).toBe(ordersBefore['T-5'])
    expect(ordersAfter['T-5']).toBeUndefined()

    const lines = linesOnTable(db, idOf(ids, 'T-6'))
    log({ test: 'race-lines', lines })
    expect(lines.map((l) => l.name).sort()).toEqual(['Chicken Biryani', 'Club Sandwich'])
    expect(activeDineIns(db)).toHaveLength(1)
    expect(dbHealth(db).integrity).toBe('ok')
    expect(dbHealth(db).fk).toHaveLength(0)

    await closeApp(app1)
    await closeApp(app2)
  })
})
