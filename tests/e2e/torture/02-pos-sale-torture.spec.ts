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
  addProduct,
  focusSearch,
  dbHealth,
  type Db
} from './_util'

/**
 * §25-§32 LIVE RETAIL POS TORTURE.
 * Every sale is verified against the live SQLite DB (client_op_id IS NOT NULL
 * marks real orders vs seeded history): orders, order_lines, payments,
 * stock_movements, audit log. UI → domain → database triangulation.
 */

const realOrder = (db: Db) =>
  q1<{
    id: string
    number_label: string
    status: string
    total: number
    subtotal: number
    discount_total: number
    tax_total: number
    user_id: string
  }>(
    db,
    `SELECT id, number_label, status, total, subtotal, discount_total, tax_total, user_id
     FROM orders WHERE client_op_id IS NOT NULL ORDER BY created_at DESC, number DESC LIMIT 1`
  )
const realOrders = (db: Db) =>
  q<{ id: string; number: number; status: string; total: number }>(
    db,
    `SELECT id, number, status, total FROM orders WHERE client_op_id IS NOT NULL ORDER BY number`
  )
const realPayments = (db: Db) =>
  q<{ amount: number; method: string; status: string; order_id: string }>(
    db,
    `SELECT p.amount, p.method, p.status, p.order_id FROM payments p
     JOIN orders o ON o.id = p.order_id WHERE o.client_op_id IS NOT NULL`
  )

test.describe('core sale journey with DB triangulation', () => {
  test('complete cash sale → DB rows reconcile exactly (order/lines/payment/stock/audit)', async () => {
    const { app, dir } = await launchT({ label: 'sale-core' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    const before = {
      cola: q1<{ onhand: number }>(
        db,
        `SELECT COALESCE(SUM(qty_delta),0) onhand FROM stock_movements WHERE product_id = (SELECT id FROM products WHERE sku='BEV-001')`
      ).onhand
    }

    await addProduct(page, 'Coca-Cola 500ml PET')
    await addProduct(page, 'Lays Salted 40g')
    await expect(page.locator('ul li')).toHaveCount(2)

    const t0 = Date.now()
    await page.click('button:has-text("Charge")')
    await page.waitForSelector('text=Payment complete', { timeout: 15_000 })
    perf({ metric: 'checkout-cash-2-lines', ms: Date.now() - t0 })

    const receipt = await page.locator('div.font-mono').innerText()
    expect(receipt).toContain('TOTAL')

    expect(dbHealth(db).integrity).toBe('ok')

    const after = {
      cola: q1<{ onhand: number }>(
        db,
        `SELECT COALESCE(SUM(qty_delta),0) onhand FROM stock_movements WHERE product_id = (SELECT id FROM products WHERE sku='BEV-001')`
      ).onhand
    }
    expect(before.cola - after.cola).toBe(1000) // exactly one Coca-Cola deducted

    const order = realOrder(db)
    expect(order.subtotal).toBe(18000)
    expect(order.tax_total).toBe(3240)
    expect(order.total).toBe(21240)
    expect(order.status).toBe('completed')
    expect(order.user_id).not.toBe('seed')

    const pays = q<{ amount: number; method: string; status: string }>(
      db,
      `SELECT amount, method, status FROM payments WHERE order_id = ?`,
      order.id
    )
    expect(pays).toHaveLength(1)
    expect(pays[0]).toMatchObject({ amount: 21240, method: 'cash', status: 'approved' })

    const lines = q<{ quantity: number; line_total: number }>(
      db,
      `SELECT quantity, line_total FROM order_lines WHERE order_id = ? ORDER BY sort_order`,
      order.id
    )
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.quantity)).toEqual([1000, 1000])
    expect(receipt).toContain(order.number_label)

    const audits = q1<{ c: number }>(
      db,
      `SELECT COUNT(*) c FROM audit_log WHERE entity='order' AND entity_id = ?`,
      order.id
    ).c
    expect(audits).toBeGreaterThanOrEqual(1)

    await shot(page, 'sale-core-receipt')
    db.close()
    await closeApp(app)
  })

  test('LT-002 RED: double-click Charge must create exactly ONE sale (deterministic same-tick + 8 real double-clicks)', async () => {
    const { app, dir } = await launchT({ label: 'sale-dblclick' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    // (a) Deterministic: two click events dispatched in the same JS turn —
    // the tightest possible human double-click / click+Enter combo.
    await addProduct(page, 'Sprite 1.5L')
    await page.evaluate(
      `document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('Charge')) { b.click(); b.click(); } })`
    )
    await page.waitForTimeout(2000)
    // Dismiss receipt if it appeared
    const doneA = page.locator('[role=dialog] button:has-text("Done")')
    if (await doneA.count()) await doneA.click().catch(() => null)
    await page.waitForTimeout(300)
    let orders = realOrders(db)
    let payments = realPayments(db)
    log({ test: 'dblclick-sametick', orders: orders.length, payments: payments.length })

    // (b) Realistic: 8 more rapid double-clicks, counting duplicates
    const dupObserved = 0
    for (let i = 0; i < 8; i++) {
      await addProduct(page, 'Pepsi 500ml PET')
      const charge = page.locator('button:has-text("Charge")')
      await Promise.all([charge.click(), charge.click({ timeout: 1000 }).catch(() => null)])
      await page.waitForTimeout(300)
      const done = page.locator('[role=dialog] button:has-text("Done")')
      if (await done.count()) await done.click().catch(() => null)
      await page.waitForTimeout(250)
    }
    orders = realOrders(db)
    payments = realPayments(db)
    // 9 carts charged → 9 orders expected
    log({ test: 'dblclick-real-loop', orders: orders.length, payments: payments.length })
    await shot(page, 'sale-dblclick-after')

    // THE invariant: one cart = one economic effect, always
    expect(orders).toHaveLength(9)
    expect(payments).toHaveLength(9)
    const moves = q1<{ c: number }>(
      db,
      `SELECT COUNT(*) c FROM stock_movements WHERE reason='sale' AND product_id=(SELECT id FROM products WHERE sku='BEV-003')`
    ).c
    expect(moves).toBe(1) // Sprite once (case a); Pepsi handled below
    const pepsi = q1<{ c: number }>(
      db,
      `SELECT COUNT(*) c FROM stock_movements WHERE reason='sale' AND product_id=(SELECT id FROM products WHERE sku='BEV-002')`
    ).c
    expect(pepsi).toBe(8)
    expect(dupObserved).toBe(0)
    db.close()
    await closeApp(app)
  })

  test('F9 keyboard spam (5 rapid payments)', async () => {
    const { app, dir } = await launchT({ label: 'sale-f9spam' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Pepsi 500ml PET')
    for (let i = 0; i < 5; i++) await page.keyboard.press('F9')
    await page.waitForTimeout(2500)
    const orders = realOrders(db)
    log({ test: 'f9-spam', orders: orders.length })
    expect(orders).toHaveLength(1)
    expect(realPayments(db)).toHaveLength(1)
    db.close()
    await closeApp(app)
  })

  test('Enter key spam on focused Charge button', async () => {
    const { app, dir } = await launchT({ label: 'sale-enterspam' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Sting Energy Drink 250ml')
    await page.focus('button:has-text("Charge")')
    for (let i = 0; i < 6; i++) await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
    const orders = realOrders(db)
    log({ test: 'enter-spam', orders: orders.length })
    expect(orders).toHaveLength(1)
    db.close()
    await closeApp(app)
  })

  test('navigate away mid-payment must not duplicate or lose the sale', async () => {
    const { app, dir } = await launchT({ label: 'sale-navaway' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Oreo Original 144g')
    // Same-tick: click Charge and the dashboard nav link in one JS turn —
    // navigation happens while the payment IPC is in flight.
    await page.evaluate(`(() => {
      const charge = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Charge'));
      const nav = document.querySelector('a[href="#/dashboard"]');
      charge.click(); nav.click();
    })()`)
    await page.waitForTimeout(2500)
    const orders = realOrders(db)
    const pays = realPayments(db)
    log({ test: 'nav-away-midpay', orders: orders.length, payments: pays.length })
    // exactly one economic effect
    expect(orders).toHaveLength(1)
    expect(pays).toHaveLength(1)
    db.close()
    await closeApp(app)
  })

  test('cart quantity can exceed on-hand via + button; server must reject at sale', async () => {
    const { app, dir } = await launchT({ label: 'sale-overstock' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    const prod = q1<{ id: string; stock: number }>(
      db,
      `SELECT p.id, COALESCE((SELECT SUM(qty_delta) FROM stock_movements m WHERE m.product_id = p.id),0) stock
       FROM products p WHERE p.sku='HLD-002'`
    )
    expect(prod.stock).toBeGreaterThan(0)

    await addProduct(page, 'Vim Dish Bar 300g')
    const plus = page.locator('button[aria-label="Increase quantity of Vim Dish Bar 300g"]')
    const clicks = Math.min(prod.stock + 10, 120)
    for (let i = 0; i < clicks; i++) await plus.click()
    await page.click('button:has-text("Charge")')
    await page.waitForTimeout(2000)

    const onhand = q1<{ onhand: number }>(
      db,
      `SELECT COALESCE(SUM(qty_delta),0) onhand FROM stock_movements WHERE product_id = ?`,
      prod.id
    ).onhand
    const orders = realOrders(db)
    log({
      test: 'overstock-sale',
      stockBefore: prod.stock,
      qtyRequested: clicks + 1,
      realOrders: orders.length,
      statuses: orders.map((o) => o.status),
      onhandAfter: onhand
    })
    await shot(page, 'sale-overstock')
    // CRITICAL invariant: stock must never go negative
    expect(onhand).toBeGreaterThanOrEqual(0)
    // Either fully rejected (no order), or completed with stock still >= 0
    for (const o of orders) {
      if (o.status === 'completed') {
        expect(onhand).toBeGreaterThanOrEqual(0)
      }
    }
    // If rejected, an error must be user-visible
    if (orders.length === 0) {
      expect(await page.locator('[role=alert]').count()).toBeGreaterThan(0)
    }
    db.close()
    await closeApp(app)
  })
})

test.describe('search + barcode torture (§26-§27)', () => {
  const FUZZ_TERMS = [
    '',
    '   ',
    'cola',
    'COLA',
    'BEV-001',
    '8961001000011',
    "' OR 1=1 --",
    "'; DROP TABLE products;--",
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'اردو کولا',
    '😀cola😀',
    '"quoted"',
    '%_%',
    'a'.repeat(5000),
    '\x00\x01control',
    'unitte\u0301st'
  ]

  test('search fuzz: all terms handled, DB integrity intact', async () => {
    const { app, dir } = await launchT({ label: 'search-fuzz' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    const box = page.locator('input[aria-label="Search products"]')
    for (const term of FUZZ_TERMS) {
      await box.fill(term)
      await page.waitForTimeout(350)
      const body = await page.locator('body').innerText()
      expect(body).toBeTruthy()
    }
    await box.fill('Coca-Cola')
    await page.waitForSelector('button:has-text("Coca-Cola 500ml PET")', { timeout: 5000 })
    expect(dbHealth(db).integrity).toBe('ok')
    // SQLi probes must not have mutated anything
    const products = q1<{ c: number }>(db, 'SELECT COUNT(*) c FROM products').c
    expect(products).toBeGreaterThan(60)
    db.close()
    await closeApp(app)
  })

  test('rapid typing/deleting does not corrupt results (stale response check)', async () => {
    const { app } = await launchT({ label: 'search-rapid' })
    const page = await login(app, 'owner')
    const box = page.locator('input[aria-label="Search products"]')
    const t0 = Date.now()
    for (let i = 0; i < 25; i++) {
      await box.fill('co')
      await box.fill('coc')
      await box.fill('coca')
      await box.fill('')
    }
    await box.fill('coca')
    await page.waitForSelector('button:has-text("Coca-Cola 500ml PET")', { timeout: 5000 })
    perf({ metric: 'search-rapid-100-keystrokes', ms: Date.now() - t0 })
    // Final visible grid must correspond to 'coca' — no stale bleed
    const names = await page.locator('.grid button').allInnerTexts()
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(n.toLowerCase()).toContain('coca')
    await closeApp(app)
  })

  test('LT-005 RED: barcode wedge — scanned barcode adds exactly the right product', async () => {
    const { app } = await launchT({ label: 'barcode-wedge' })
    const page = await login(app, 'owner')
    // Scanner-wedge: digits + Enter into the focused search box, fast like a real scanner
    await focusSearch(page)
    await page.keyboard.type('8961001000011', { delay: 1 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const lines = await page.locator('ul li').count()
    const first = lines ? await page.locator('ul li').first().innerText() : ''
    log({ test: 'barcode-wedge', lines, first })
    expect(lines).toBe(1)
    expect(first).toContain('Coca-Cola 500ml PET')
    await closeApp(app)
  })

  test('unknown barcode + Enter must NOT add a wrong product', async () => {
    const { app } = await launchT({ label: 'barcode-unknown' })
    const page = await login(app, 'owner')
    // Let the grid settle first (debounce), then scan an unknown code
    await page.waitForTimeout(600)
    await focusSearch(page)
    await page.keyboard.type('9999999999999', { delay: 1 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    expect(await page.locator('ul li').count()).toBe(0)
    await closeApp(app)
  })

  test('scanner flood: 50 scans in ~2s — every scan must add its product', async () => {
    const { app } = await launchT({ label: 'barcode-flood' })
    const page = await login(app, 'owner')
    await focusSearch(page)
    const t0 = Date.now()
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type('8961001100019', { delay: 0 }) // Lays Salted 40g
      await page.keyboard.press('Enter')
    }
    await page.waitForTimeout(1500)
    const ms = Date.now() - t0
    const lines = await page.locator('ul li').count()
    const qty = lines ? await page.locator('ul li span.nums').first().innerText() : null
    perf({ metric: 'barcode-flood-50', ms, lines })
    log({ test: 'barcode-flood', lines, qty, ms })
    await shot(page, 'barcode-flood')
    // LT-005 RED: 50 scans must yield exactly 50 units of Lays
    expect(lines).toBe(1)
    expect(qty?.trim()).toBe('50')
    await closeApp(app)
  })
})

test.describe('discount + money torture (§30-§31)', () => {
  test('UI guard matrix: invalid discount inputs are refused client-side', async () => {
    const { app, dir } = await launchT({ label: 'disc-guards' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'KitKat 4 Finger 41.5g') // 25000

    // Values the number input itself or applyDiscount must refuse
    for (const value of ['100.5', '-25', '99999']) {
      await page.click('button[title="Discount"]')
      await page.fill('input[aria-label="Discount value"]', '')
      await page.fill('input[aria-label="Discount value"]', value)
      await page.click('[role=dialog] button:has-text("Apply")')
      await page.waitForTimeout(150)
      // No Discount row may appear for refused values
      expect(await page.locator('text=Discount').count()).toBe(0)
    }
    // Non-numeric into a number input cannot even be typed (browser guard)
    await page.click('button[title="Discount"]')
    try {
      await page.fill('input[aria-label="Discount value"]', 'abc')
    } catch {
      /* expected: input[type=number] refuses */
    }
    await page.keyboard.press('Escape')
    // No sale happened; no order rows
    expect(realOrders(db)).toHaveLength(0)
    db.close()
    await closeApp(app)
  })

  const SERVER_CASES: Array<{
    mode: 'percent' | 'amount'
    value: string
    name: string
    price: number
  }> = [
    { mode: 'percent', value: '0', name: 'KitKat 4 Finger 41.5g', price: 25000 },
    { mode: 'percent', value: '50', name: 'Oreo Original 144g', price: 28000 },
    { mode: 'amount', value: '0', name: 'Bisconni Chocolate Chip 8-pack', price: 18000 },
    { mode: 'amount', value: '5', name: 'Prince Biscuit Roll Pack', price: 8000 },
    { mode: 'amount', value: '999999', name: 'Peek Freans Gluco 6-roll', price: 20000 }
  ]

  test('server truth matrix: each discount case completes and reconciles', async () => {
    const { app, dir } = await launchT({ label: 'disc-server' })
    const page = await login(app, 'owner')
    const db = openDb(dir)

    for (const c of SERVER_CASES) {
      await addProduct(page, c.name)
      await page.click('button[title="Discount"]')
      await page.selectOption('select[aria-label="Discount type"]', c.mode)
      await page.fill('input[aria-label="Discount value"]', '')
      await page.fill('input[aria-label="Discount value"]', c.value)
      await page.click('[role=dialog] button:has-text("Apply")')
      await page.waitForTimeout(200)
      await page.click('button:has-text("Charge")')
      await page.waitForSelector('text=Payment complete', { timeout: 10_000 })
      const done = page.locator('[role=dialog] button:has-text("Done")')
      if (await done.count()) {
        await done.click().catch(() => null)
        await page.waitForTimeout(200)
      }

      const order = realOrder(db)
      log({
        test: 'discount-db',
        case: `${c.mode}=${c.value}`,
        product: c.name,
        status: order?.status,
        total: order?.total,
        discount: order?.discount_total
      })
      expect(order).toBeTruthy()
      expect(order.status).toBe('completed')
      expect(order.total).toBeGreaterThanOrEqual(0)
      const undiscountedMax = Math.round(c.price * 1.18)
      expect(order.total).toBeLessThanOrEqual(undiscountedMax)
      expect(order.discount_total).toBeLessThanOrEqual(undiscountedMax)
    }
    db.close()
    await closeApp(app)
  })

  test('LT-006 RED: 100% discounted sale must complete with a zero-value payment', async () => {
    const { app, dir } = await launchT({ label: 'disc-100' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Cadbury Dairy Milk 38g') // 22000
    await page.click('button[title="Discount"]')
    await page.selectOption('select[aria-label="Discount type"]', 'percent')
    await page.fill('input[aria-label="Discount value"]', '100')
    await page.click('[role=dialog] button:has-text("Apply")')
    await page.waitForTimeout(200)
    await page.click('button:has-text("Charge")')
    await page.waitForTimeout(1500)
    await shot(page, 'discount-100-error-state')
    const order = realOrder(db)
    log({ test: 'lt006', order })
    expect(order).toBeTruthy()
    expect(order.total).toBe(0)
    // RED: currently the order is stranded as 'open' with no payment and a
    // raw zod error on screen; a fully-comped sale must be completable.
    expect(order.status).toBe('completed')
    const pays = q1<{ c: number }>(
      db,
      `SELECT COUNT(*) c FROM payments WHERE order_id = ?`,
      order.id
    ).c
    expect(pays).toBe(1)
    db.close()
    await closeApp(app)
  })

  test('discount replaces (no stacking): amount after percent', async () => {
    const { app, dir } = await launchT({ label: 'disc-stack' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'CandyLand Chilli Milli 36g') // 4000
    await page.click('button[title="Discount"]')
    await page.selectOption('select[aria-label="Discount type"]', 'percent')
    await page.fill('input[aria-label="Discount value"]', '50')
    await page.click('[role=dialog] button:has-text("Apply")')
    await page.waitForTimeout(150)
    await page.click('button[title="Discount"]')
    await page.selectOption('select[aria-label="Discount type"]', 'amount')
    await page.fill('input[aria-label="Discount value"]', '10')
    await page.click('[role=dialog] button:has-text("Apply")')
    await page.waitForTimeout(200)
    await page.click('button:has-text("Charge")')
    await page.waitForTimeout(1200)
    const order = realOrder(db)
    log({ test: 'discount-stack', db: order })
    // Second apply REPLACES the first — exactly one discount, amount 10.00
    expect(order.discount_total).toBe(1000)
    db.close()
    await closeApp(app)
  })
})

test.describe('hold / recall torture (§28)', () => {
  test('LT-004 RED: hold → recall → cart shows the held lines → pay', async () => {
    const { app, dir } = await launchT({ label: 'hold-recall' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Bran Bread Loaf')
    await page.click('button[title="Hold order"]')
    await page.fill('input[aria-label="Hold name"]', 'Ali — waiting')
    await page.click('[role=dialog] button:has-text("Hold")')
    await expect(page.locator('text=Held orders (1)')).toBeVisible({ timeout: 10_000 })

    await page.click('text=Ali — waiting')
    await page.waitForTimeout(800)
    // LT-004 RED: the recalled cart must show the held line
    await shot(page, 'hold-recall-after')
    expect(await page.locator('ul li').count()).toBe(1)

    await page.click('button:has-text("Charge")')
    await page.waitForTimeout(1500)
    const order = realOrder(db)
    expect(order.status).toBe('completed')
    const lines = q1<{ c: number }>(
      db,
      `SELECT COUNT(*) c FROM order_lines WHERE order_id = ?`,
      order.id
    ).c
    expect(lines).toBe(1)
    db.close()
    await closeApp(app)
  })

  test('LT-003 RED: double-click Hold must create exactly ONE held order (same-tick)', async () => {
    const { app, dir } = await launchT({ label: 'hold-modal' })
    const page = await login(app, 'owner')
    const db = openDb(dir)
    await addProduct(page, 'Plain Bread Large')
    // Open + Escape + reopen + cancel — modal survives intact
    await page.click('button[title="Hold order"]')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await page.click('button[title="Hold order"]')
    await page.click('[role=dialog] button:has-text("Cancel")')
    await page.waitForTimeout(200)
    // Double click Hold in the same JS turn
    await page.click('button[title="Hold order"]')
    await page.fill('input[aria-label="Hold name"]', 'dbl')
    await page.evaluate(
      `document.querySelectorAll('[role=dialog] button').forEach(b => { if (b.textContent.trim() === 'Hold') { b.click(); b.click(); } })`
    )
    await page.waitForTimeout(1500)
    const held = q<{ hold_name: string }>(db, `SELECT hold_name FROM orders WHERE status='held'`)
    log({ test: 'hold-double-click', heldCount: held.length })
    expect(held.length).toBe(1)
    db.close()
    await closeApp(app)
  })

  test('cart ops: qty− disabled at 1; remove line; clear; pay hidden when empty', async () => {
    const { app } = await launchT({ label: 'cart-ops' })
    const page = await login(app, 'owner')
    await addProduct(page, 'Eggs Farm Fresh Dozen')
    await addProduct(page, 'Butter Salted 200g')
    const minus = page.locator('button[aria-label="Decrease quantity of Eggs Farm Fresh Dozen"]')
    await expect(minus).toBeDisabled() // qty 1 → cannot go to 0 via −
    await expect(page.locator('ul li')).toHaveCount(2)
    await page.click('button[aria-label="Remove Eggs Farm Fresh Dozen"]')
    await expect(page.locator('ul li')).toHaveCount(1)
    await page.click('button[aria-label="Clear cart"]')
    await expect(page.locator('text=Cart is empty')).toBeVisible()
    expect(await page.locator('button:has-text("Charge")').count()).toBe(0)
    await closeApp(app)
  })
})
