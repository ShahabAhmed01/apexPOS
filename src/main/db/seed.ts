import type { DB } from './database'
import { hashPassword } from '../security/passwords'
import { PERMISSION_GROUPS } from '@shared/auth/permissions'

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

/** Deterministic pseudo-random stream so every fresh demo database is identical. */
const makeLcg = (seedValue: number): (() => number) => {
  let s = seedValue
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

/**
 * Base seed: system roles, role-permission grants and units of measure.
 * Always required — the onboarding wizard cannot create an administrator
 * without roles. Idempotent (no-op when roles already exist).
 */
export const seedBase = (db: DB): void => {
  const hasRoles = db.prepare('SELECT COUNT(*) AS c FROM roles').get() as { c: number }
  if (hasRoles.c > 0) return
  seedRoles(db)
  seedUnits(db)
}

/**
 * Idempotent demo seed. Safe to call on every boot — it only inserts
 * when the database is empty (no organizations). Demo credentials are
 * documented in README; production deployments must rotate them.
 *
 * Also marks onboarding complete: a demo database is fully configured.
 */
export const seedIfEmpty = (db: DB): boolean => {
  const hasOrg = db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }
  if (hasOrg.c > 0) return false

  seedBase(db)
  const t = now()
  const tx = db.transaction(() => {
    // ---- Organization / branch / register / terminal ----------------------
    const orgId = id()
    db.prepare(
      `INSERT INTO organizations (id, name, currency, timezone, created_at)
       VALUES (?, 'Apex Demo Store', 'PKR', 'Asia/Karachi', ?)`
    ).run(orgId, t)

    const branchId = id()
    db.prepare(
      `INSERT INTO branches (id, organization_id, name, code, address, phone)
       VALUES (?, ?, 'Main Branch', 'MAIN', 'Plot 14, Clifton Block 5, Karachi', '021-35820001')`
    ).run(branchId, orgId)

    const regId = id()
    db.prepare(
      `INSERT INTO registers (id, branch_id, name, code) VALUES (?, ?, 'Front Counter', 'REG-01')`
    ).run(regId, branchId)

    db.prepare(
      `INSERT INTO terminals (id, branch_id, register_id, name, device_key)
       VALUES (?, ?, ?, 'Terminal 1', 'term-local-01')`
    ).run(id(), branchId, regId)

    // ---- Role ids (roles themselves come from seedBase) --------------------
    const roleIds: Record<string, string> = {}
    for (const r of db.prepare('SELECT id, name FROM roles').all() as {
      id: string
      name: string
    }[]) {
      roleIds[r.name] = r.id
    }

    // ---- Users (demo credentials — see README) -----------------------------
    const userSeed: [string, string, string, string][] = [
      ['owner', 'Omar Farooq', 'Owner123!', 'Owner'],
      ['admin', 'Ayesha Khan', 'Admin123!', 'Administrator'],
      ['manager', 'Bilal Ahmed', 'Manager123!', 'Manager'],
      ['cashier', 'Sara Iqbal', 'Cashier123!', 'Cashier'],
      ['waiter', 'Hamza Tariq', 'Waiter123!', 'Waiter'],
      ['kitchen', 'Faisal Raza', 'Kitchen123!', 'Kitchen Staff'],
      ['inventory', 'Nadia Hussain', 'Inventory123!', 'Inventory Manager'],
      ['purchasing', 'Imran Sheikh', 'Purchase123!', 'Purchasing Manager'],
      ['accountant', 'Zara Malik', 'Account123!', 'Accountant'],
      ['auditor', 'Kamran Ali', 'Audit123!', 'Auditor']
    ]
    const userInsert = db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, pin_hash, role_id, branch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const [username, display, password, role] of userSeed) {
      userInsert.run(
        id(),
        username,
        display,
        hashPassword(password),
        hashPassword('1234'),
        roleIds[role]!,
        branchId,
        t
      )
    }

    // ---- Units (seeded by seedBase) ------------------------------------------
    const unitIds: Record<string, string> = {}
    for (const u of db.prepare('SELECT id, code FROM units').all() as { id: string; code: string }[]) {
      unitIds[u.code] = u.id
    }

    // ---- Taxes --------------------------------------------------------------
    const taxStd = id()
    const taxInsert = db.prepare(
      'INSERT INTO taxes (id, name, rate_bps, inclusive, is_default) VALUES (?, ?, ?, ?, ?)'
    )
    taxInsert.run(taxStd, 'Sales Tax 18%', 1800, 0, 1)
    taxInsert.run(id(), 'Reduced Rate 5%', 500, 0, 0)
    taxInsert.run(id(), 'Exempt', 0, 0, 0)

    // ---- Categories -----------------------------------------------------------
    const catInsert = db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)')
    const catIds: Record<string, string> = {}
    const cats = [
      'Beverages',
      'Snacks & Confectionery',
      'Grocery Staples',
      'Dairy & Eggs',
      'Personal Care',
      'Household',
      'Bakery',
      'Frozen Foods'
    ]
    cats.forEach((c, i) => {
      const cid = id()
      catIds[c] = cid
      catInsert.run(cid, c, i)
    })

    // ---- Suppliers -------------------------------------------------------------
    const supInsert = db.prepare(
      `INSERT INTO suppliers (id, name, contact_name, phone, email, address)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const suppliers: [string, string, string, string, string][] = [
      [
        'Metro Distribution Co.',
        'Asif Raza',
        '0301-1234567',
        'orders@metrod.pk',
        'Industrial Area, Karachi'
      ],
      [
        'Haleeb Foods Supply',
        'Sana Tariq',
        '0302-7654321',
        'supply@haleeb.pk',
        'Lahore Road, Sheikhupura'
      ],
      ['Gourmet Traders', 'Danish Ali', '0333-9876543', 'sales@gourmet.pk', 'Port Qasim, Karachi']
    ]
    const supIds: string[] = []
    for (const [name, contact, phone, email, addr] of suppliers) {
      const sid = id()
      supIds.push(sid)
      supInsert.run(sid, name, contact, phone, email, addr)
    }

    return { orgId, branchId, regId, catIds, supIds, unitIds, taxStd }
  })

  const ctx = tx.immediate()
  seedProducts(db, ctx.catIds, ctx.unitIds, ctx.taxStd, ctx.branchId)
  seedRestaurant(db, ctx.branchId)
  seedCustomers(db)
  seedHistoricalOrders(db, ctx.branchId)
  // A demo database is fully configured — onboarding is considered complete.
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('app.onboarding', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify({ status: 'complete', stepIndex: 0, data: {}, completedAt: t, demo: true }))
  return true
}

/** System roles + their permission grants. Returns role name → id. */
const seedRoles = (db: DB): Record<string, string> => {
  const roleIds: Record<string, string> = {}
  const rolePerms: Record<string, string[]> = {
    Owner: PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
    Administrator: PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
    Manager: [
      'sales.view',
      'sales.create',
      'sales.void',
      'sales.refund',
      'sales.exchange',
      'discounts.apply',
      'discounts.override',
      'payments.take',
      'payments.refund',
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'inventory.receive',
      'inventory.transfer',
      'inventory.count',
      'purchases.view',
      'purchases.create',
      'purchases.approve',
      'purchases.receive',
      'customers.view',
      'customers.manage',
      'customers.credit',
      'tables.view',
      'tables.manage',
      'tables.transfer',
      'kitchen.view',
      'kitchen.manage',
      'reports.view',
      'reports.export',
      'register.open',
      'register.close',
      'cash.adjust',
      'cash.no_sale',
      'cash.view_variance',
      'users.view',
      'audit.view',
      'data.backup'
    ],
    Cashier: [
      'sales.view',
      'sales.create',
      'discounts.apply',
      'payments.take',
      'customers.view',
      'tables.view',
      'register.open',
      'register.close'
    ],
    Waiter: ['sales.view', 'sales.create', 'tables.view', 'kitchen.view'],
    'Kitchen Staff': ['kitchen.view', 'kitchen.manage'],
    'Inventory Manager': [
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'inventory.receive',
      'inventory.transfer',
      'inventory.count',
      'purchases.view',
      'reports.view'
    ],
    'Purchasing Manager': [
      'purchases.view',
      'purchases.create',
      'purchases.approve',
      'purchases.receive',
      'inventory.view',
      'reports.view'
    ],
    Accountant: ['reports.view', 'reports.export', 'audit.view'],
    Auditor: ['reports.view', 'audit.view']
  }
  const roleInsert = db.prepare(
    'INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, 1)'
  )
  const permInsert = db.prepare(
    'INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)'
  )
  const tx = db.transaction(() => {
    for (const [name, perms] of Object.entries(rolePerms)) {
      const rid = id()
      roleIds[name] = rid
      roleInsert.run(rid, name, `System role: ${name}`)
      for (const p of perms) permInsert.run(rid, p)
    }
  })
  tx.immediate()
  return roleIds
}

/** Units of measure. Returns unit code → id. */
const seedUnits = (db: DB): Record<string, string> => {
  const unitInsert = db.prepare('INSERT INTO units (id, code, name, decimals) VALUES (?, ?, ?, ?)')
  const units: [string, string, number][] = [
    ['pc', 'Piece', 0],
    ['box', 'Box', 0],
    ['carton', 'Carton', 0],
    ['kg', 'Kilogram', 3],
    ['g', 'Gram', 0],
    ['L', 'Litre', 3],
    ['ml', 'Millilitre', 0]
  ]
  const unitIds: Record<string, string> = {}
  const tx = db.transaction(() => {
    for (const [code, name, decimals] of units) {
      const uid = id()
      unitIds[code] = uid
      unitInsert.run(uid, code, name, decimals)
    }
  })
  tx.immediate()
  return unitIds
}

/**
 * Demo catalog for a branch that already exists (used by the onboarding
 * wizard's "load demo data" option): taxes, categories, suppliers, retail
 * products, restaurant menu/tables, customers, gift cards and 60 days of
 * deterministic sales history. Does NOT create organizations or users.
 */
export const seedDemoCatalog = (db: DB, branchId: string): void => {
  const t = now()
  let taxStd = ''
  const tx = db.transaction(() => {
    taxStd = id()
    // If onboarding already configured a default tax, keep it — demo taxes are samples.
    const hasDefault = (
      db.prepare('SELECT COUNT(*) AS c FROM taxes WHERE is_default = 1').get() as { c: number }
    ).c > 0
    const taxInsert = db.prepare(
      'INSERT INTO taxes (id, name, rate_bps, inclusive, is_default) VALUES (?, ?, ?, ?, ?)'
    )
    taxInsert.run(taxStd, 'Sales Tax 18%', 1800, 0, hasDefault ? 0 : 1)
    taxInsert.run(id(), 'Reduced Rate 5%', 500, 0, 0)
    taxInsert.run(id(), 'Exempt', 0, 0, 0)

    const catInsert = db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)')
    const catIds: Record<string, string> = {}
    const cats = [
      'Beverages',
      'Snacks & Confectionery',
      'Grocery Staples',
      'Dairy & Eggs',
      'Personal Care',
      'Household',
      'Bakery',
      'Frozen Foods'
    ]
    cats.forEach((c, i) => {
      const cid = id()
      catIds[c] = cid
      catInsert.run(cid, c, i)
    })

    const supInsert = db.prepare(
      `INSERT INTO suppliers (id, name, contact_name, phone, email, address)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const suppliers: [string, string, string, string, string][] = [
      [
        'Metro Distribution Co.',
        'Asif Raza',
        '0301-1234567',
        'orders@metrod.pk',
        'Industrial Area, Karachi'
      ],
      [
        'Haleeb Foods Supply',
        'Sana Tariq',
        '0302-7654321',
        'supply@haleeb.pk',
        'Lahore Road, Sheikhupura'
      ],
      ['Gourmet Traders', 'Danish Ali', '0333-9876543', 'sales@gourmet.pk', 'Port Qasim, Karachi']
    ]
    for (const [name, contact, phone, email, addr] of suppliers) {
      supInsert.run(id(), name, contact, phone, email, addr)
    }
    return catIds
  })
  const catIds = tx.immediate()
  const unitIds: Record<string, string> = {}
  for (const u of db.prepare('SELECT id, code FROM units').all() as { id: string; code: string }[]) {
    unitIds[u.code] = u.id
  }
  seedProducts(db, catIds, unitIds, taxStd, branchId)
  seedRestaurant(db, branchId)
  seedCustomers(db)
  seedHistoricalOrders(db, branchId)
  void t
}

/**
 * 60 days of deterministic synthetic sales so dashboards/reports/exports
 * have meaningful data during development and demo. Money stays integer-based.
 */
function seedHistoricalOrders(db: DB, branchId: string): void {
  // Deterministic RNG so every fresh database looks identical
  let s = 42
  const rand = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff

  const productIds = (
    db
      .prepare(`SELECT id, price, tax_id FROM products WHERE track_stock = 1 ORDER BY sku`)
      .all() as { id: string; price: number; tax_id: string | null }[]
  ).slice(0, 40)

  if (productIds.length === 0) return

  const insOrder = db.prepare(
    `INSERT INTO orders (id, branch_id, number, number_label, type, status, terminal_id, user_id,
       subtotal, discount_total, tax_total, service_charge, tip, rounding_adjustment, total, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'retail', 'completed', 'term-local-01', 'seed', ?, 0, ?, 0, 0, 0, ?, ?, ?)`
  )
  const insLine = db.prepare(
    `INSERT INTO order_lines (id, order_id, product_id, sku, name, quantity, unit_price, tax_bps, tax_amount, line_total, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'served', ?)`
  )
  const insPayment = db.prepare(
    `INSERT INTO payments (id, order_id, method, amount, status, created_at)
     VALUES (?, ?, ?, ?, 'approved', ?)`
  )

  const tx = db.transaction(() => {
    let orderNo = (
      db.prepare('SELECT COALESCE(MAX(number),0) AS n FROM orders').get() as { n: number }
    ).n
    for (let day = 59; day >= 0; day--) {
      const date = new Date()
      date.setDate(date.getDate() - day)
      const ordersToday = 3 + Math.floor(rand() * 8) // 3–10 orders/day
      for (let i = 0; i < ordersToday; i++) {
        orderNo += 1
        const orderId = crypto.randomUUID()
        const hour = 8 + Math.floor(rand() * 13) // 8am–9pm
        const created = new Date(date)
        created.setHours(hour, Math.floor(rand() * 60), 0, 0)
        const t = created.toISOString()

        const lines = 1 + Math.floor(rand() * 4)
        let subtotal = 0
        let taxTotal = 0
        const orderLines: [string, number, number, number][] = [] // productId, qtyMilli, unitPrice, lineTotal
        for (let l = 0; l < lines; l++) {
          const p = productIds[Math.floor(rand() * productIds.length)]!
          const qty = (1 + Math.floor(rand() * 3)) * 1000
          const lineNet = p.price * (qty / 1000)
          subtotal += lineNet
          // Approximate standard tax when product has a tax_id mapped (18%)
          const taxRate = p.tax_id ? 0.18 : 0
          taxTotal += Math.round(lineNet * taxRate)
          orderLines.push([p.id, qty, p.price, lineNet + Math.round(lineNet * taxRate)])
        }
        const total = subtotal + taxTotal
        insOrder.run(orderId, branchId, orderNo, `ORD-${orderNo}`, subtotal, taxTotal, total, t, t)
        orderLines.forEach(([pid, qtyMilli, price, lineTotal], idx) => {
          const nameRow = db.prepare('SELECT sku, name FROM products WHERE id = ?').get(pid) as {
            sku: string
            name: string
          }
          insLine.run(
            crypto.randomUUID(),
            orderId,
            pid,
            nameRow.sku,
            nameRow.name,
            qtyMilli,
            price,
            1800,
            Math.round(lineTotal - (price * qtyMilli) / 1000),
            lineTotal,
            idx
          )
        })
        const method =
          rand() < 0.55
            ? 'cash'
            : rand() < 0.7
              ? 'card'
              : rand() < 0.85
                ? 'mobile_wallet'
                : 'voucher'
        insPayment.run(crypto.randomUUID(), orderId, method, total, t)
      }
    }
  })
  tx.immediate()
}

// ---------------------------------------------------------------------------
// Products (60+ retail + weighted + variants)
// ---------------------------------------------------------------------------
const P = (
  sku: string,
  barcode: string,
  name: string,
  cat: string,
  price: number,
  cost: number,
  unit: string,
  opts: Partial<{ weighted: boolean; low: number }> = {}
) => ({ sku, barcode, name, cat, price, cost, unit, ...opts })

function seedProducts(
  db: DB,
  catIds: Record<string, string>,
  unitIds: Record<string, string>,
  taxStd: string,
  branchId: string
): void {
  const products = [
    // Beverages
    P('BEV-001', '8961001000011', 'Coca-Cola 500ml PET', 'Beverages', 12000, 9000, 'pc'),
    P('BEV-002', '8961001000028', 'Pepsi 500ml PET', 'Beverages', 12000, 9000, 'pc'),
    P('BEV-003', '8961001000035', 'Sprite 1.5L', 'Beverages', 20000, 16000, 'pc'),
    P('BEV-004', '8961001000042', 'Nestlé Pure Life 1.5L', 'Beverages', 9000, 6500, 'pc'),
    P('BEV-005', '8961001000059', 'Tapal Danedar Tea 190g', 'Beverages', 52000, 44000, 'pc'),
    P('BEV-006', '8961001000066', 'Nescafé Classic 50g Jar', 'Beverages', 65000, 56000, 'pc'),
    P(
      'BEV-007',
      '8961001000073',
      'Lipton Yellow Label 100 Tea Bags',
      'Beverages',
      78000,
      68000,
      'pc'
    ),
    P('BEV-008', '8961001000080', 'Sting Energy Drink 250ml', 'Beverages', 15000, 11000, 'pc'),
    P('BEV-009', '8961001000097', 'Pakola Cream Soda 1.5L', 'Beverages', 18000, 14000, 'pc'),
    P('BEV-010', '8961001000103', 'Shezan Mango Juice 1L', 'Beverages', 32000, 26000, 'pc'),
    // Snacks
    P('SNK-001', '8961001100019', 'Lays Salted 40g', 'Snacks & Confectionery', 6000, 4500, 'pc'),
    P(
      'SNK-002',
      '8961001100026',
      'Kurkure Red Chutney 45g',
      'Snacks & Confectionery',
      6000,
      4500,
      'pc'
    ),
    P(
      'SNK-003',
      '8961001100033',
      'Super Crisp BBQ 48g',
      'Snacks & Confectionery',
      5500,
      4200,
      'pc'
    ),
    P(
      'SNK-004',
      '8961001100040',
      'Prince Biscuit Roll Pack',
      'Snacks & Confectionery',
      8000,
      6000,
      'pc'
    ),
    P(
      'SNK-005',
      '8961001100057',
      'Oreo Original 144g',
      'Snacks & Confectionery',
      28000,
      22000,
      'pc'
    ),
    P(
      'SNK-006',
      '8961001100064',
      'CandyLand Chilli Milli 36g',
      'Snacks & Confectionery',
      4000,
      2800,
      'pc'
    ),
    P(
      'SNK-007',
      '8961001100071',
      'KitKat 4 Finger 41.5g',
      'Snacks & Confectionery',
      25000,
      20000,
      'pc'
    ),
    P(
      'SNK-008',
      '8961001100088',
      'Cadbury Dairy Milk 38g',
      'Snacks & Confectionery',
      22000,
      17500,
      'pc'
    ),
    P(
      'SNK-009',
      '8961001100095',
      'Bisconni Chocolate Chip 8-pack',
      'Snacks & Confectionery',
      18000,
      14000,
      'pc'
    ),
    P(
      'SNK-010',
      '8961001100101',
      'Peek Freans Gluco 6-roll',
      'Snacks & Confectionery',
      20000,
      15500,
      'pc'
    ),
    // Grocery Staples
    P(
      'GRC-001',
      '8961001200016',
      'Basmati Rice Premium (loose)',
      'Grocery Staples',
      42000,
      35000,
      'kg',
      { weighted: true, low: 10000 }
    ),
    P(
      'GRC-002',
      '8961001200023',
      'Atta Whole Wheat 10kg Bag',
      'Grocery Staples',
      175000,
      155000,
      'pc'
    ),
    P('GRC-003', '8961001200030', 'Dal Chana (loose)', 'Grocery Staples', 38000, 31000, 'kg', {
      weighted: true
    }),
    P('GRC-004', '8961001200047', 'Sugar (loose)', 'Grocery Staples', 16000, 14000, 'kg', {
      weighted: true
    }),
    P('GRC-005', '8961001200054', 'Salt Iodized 800g', 'Grocery Staples', 8000, 6000, 'pc'),
    P('GRC-006', '8961001200061', 'Dal Mong (loose)', 'Grocery Staples', 46000, 38000, 'kg', {
      weighted: true
    }),
    P('GRC-007', '8961001200078', 'Cooking Oil 3L Bottle', 'Grocery Staples', 145000, 132000, 'pc'),
    P('GRC-008', '8961001200085', 'Ghee 1kg Pouch', 'Grocery Staples', 98000, 89000, 'pc'),
    P('GRC-009', '8961001200092', 'Pasta Spaghetti 500g', 'Grocery Staples', 24000, 18000, 'pc'),
    P('GRC-010', '8961001200108', 'Tomato Ketchup 800g', 'Grocery Staples', 32000, 25000, 'pc'),
    // Dairy
    P('DRY-001', '8961001300013', 'Milk Fresh 1L Tetra', 'Dairy & Eggs', 32000, 27000, 'pc', {
      low: 12000
    }),
    P('DRY-002', '8961001300020', 'Yogurt Plain 400g Cup', 'Dairy & Eggs', 18000, 14000, 'pc'),
    P('DRY-003', '8961001300037', 'Eggs Farm Fresh Dozen', 'Dairy & Eggs', 38000, 33000, 'pc'),
    P('DRY-004', '8961001300044', 'Butter Salted 200g', 'Dairy & Eggs', 55000, 46000, 'pc'),
    P('DRY-005', '8961001300051', 'Cheese Slices 200g (10pc)', 'Dairy & Eggs', 62000, 52000, 'pc'),
    P('DRY-006', '8961001300068', 'Cream 200ml Pack', 'Dairy & Eggs', 28000, 22000, 'pc'),
    P(
      'DRY-007',
      '8961001300075',
      'Tea Whitener Sachet Box 24pc',
      'Dairy & Eggs',
      48000,
      40000,
      'box'
    ),
    // Personal Care
    P('PRC-001', '8961001400010', 'Lifebuoy Soap 115g', 'Personal Care', 15000, 12000, 'pc'),
    P(
      'PRC-002',
      '8961001400027',
      'Lux Soap Silk Sensation 110g',
      'Personal Care',
      17000,
      13500,
      'pc'
    ),
    P('PRC-003', '8961001400034', 'Colgate MaxFresh 120g', 'Personal Care', 28000, 22000, 'pc'),
    P('PRC-004', '8961001400041', 'Head & Shoulders 90ml', 'Personal Care', 38000, 31000, 'pc'),
    P('PRC-005', '8961001400058', 'Sensitive Toothbrush Soft', 'Personal Care', 12000, 8000, 'pc'),
    P('PRC-006', '8961001400065', 'Tissue Box 200 Pulls', 'Personal Care', 14000, 10000, 'pc'),
    // Household
    P('HLD-001', '8961001500017', 'Surf Excel 1kg', 'Household', 65000, 55000, 'pc'),
    P('HLD-002', '8961001500024', 'Vim Dish Bar 300g', 'Household', 12000, 9000, 'pc'),
    P('HLD-003', '8961001500031', 'Harpic 500ml', 'Household', 32000, 25000, 'pc'),
    P('HLD-004', '8961001500048', 'Finis Dishwash Liquid 400ml', 'Household', 28000, 21000, 'pc'),
    P('HLD-005', '8961001500055', 'Garbage Bags Medium (30pc)', 'Household', 18000, 13000, 'pc'),
    // Bakery
    P('BKY-001', '8961001600014', 'Plain Cake Rusk 250g', 'Bakery', 22000, 17000, 'pc'),
    P('BKY-002', '8961001600021', 'Bran Bread Loaf', 'Bakery', 26000, 20000, 'pc'),
    P('BKY-003', '8961001600038', 'Plain Bread Large', 'Bakery', 16000, 12000, 'pc'),
    P('BKY-004', '8961001600045', 'Chocolate Muffin (each)', 'Bakery', 12000, 8000, 'pc'),
    // Frozen
    P('FRZ-001', '8961001700011', 'Chicken Tikka Boti 500g', 'Frozen Foods', 78000, 64000, 'pc'),
    P('FRZ-002', '8961001700028', 'Seekh Kabab 12pc Frozen', 'Frozen Foods', 85000, 70000, 'pc'),
    P(
      'FRZ-003',
      '8961001700035',
      'Mixed Vegetables 1kg Frozen',
      'Frozen Foods',
      42000,
      34000,
      'pc'
    ),
    P('FRZ-004', '8961001700042', 'Paratha Whole Wheat 5pc', 'Frozen Foods', 32000, 25000, 'pc')
  ]

  const rand = makeLcg(0xa9e5)
  const insertP = db.prepare(
    `INSERT INTO products (id, sku, barcode, name, category_id, unit_id, price, cost, tax_id,
       is_weighted, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const stockInsert = db.prepare(
    `INSERT INTO stock_movements (id, product_id, branch_id, qty_delta, reason, user_id, created_at)
     VALUES (?, ?, ?, ?, 'initial', 'seed', ?)`
  )

  const t = new Date().toISOString()
  const txy = db.transaction(() => {
    for (const p of products) {
      const pid = crypto.randomUUID()
      insertP.run(
        pid,
        p.sku,
        p.barcode,
        p.name,
        catIds[p.cat] ?? null,
        unitIds[p.unit]!,
        p.price,
        p.cost,
        taxStd,
        p.weighted ? 1 : 0,
        p.low ?? null,
        t,
        t
      )
      // Quantities are stored as integer milli-units (qty × 1000).
      const qty = p.weighted
        ? 50_000 + Math.floor(rand() * 50_000) // 50–100 kg
        : (30 + Math.floor(rand() * 200)) * 1000 // 30–230 pieces
      stockInsert.run(crypto.randomUUID(), pid, branchId, qty, t)
    }

    // Variant parent example — T-shirt style for apparel demo
    const teeId = crypto.randomUUID()
    insertP.run(
      teeId,
      'APR-001',
      null,
      'Cotton T-Shirt (Crew Neck)',
      catIds['Grocery Staples'] ?? null,
      unitIds['pc']!,
      150000,
      95000,
      taxStd,
      0,
      null,
      t,
      t
    )
    db.prepare(`UPDATE products SET type = 'variant_parent' WHERE id = ?`).run(teeId)
    const vIns = db.prepare(
      `INSERT INTO product_variants (id, product_id, sku, barcode, name, attributes, price, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const size of ['S', 'M', 'L', 'XL']) {
      for (const color of ['Black', 'White', 'Navy']) {
        const vId = crypto.randomUUID()
        vIns.run(
          vId,
          teeId,
          `APR-001-${color.slice(0, 1)}${size}`,
          `89610018${String(Math.floor(rand() * 1e6)).padStart(6, '0')}${size}`,
          `${color} / ${size}`,
          JSON.stringify({ color, size }),
          150000,
          95000
        )
        stockInsert.run(crypto.randomUUID(), teeId, branchId, 0, t) // variant stock below
        db.prepare(
          `INSERT INTO stock_movements (id, product_id, variant_id, branch_id, qty_delta, reason, user_id, created_at)
           VALUES (?, ?, ?, ?, ?, 'initial', 'seed', ?)`
        ).run(
          crypto.randomUUID(),
          teeId,
          vId,
          branchId,
          (8 + Math.floor(rand() * 20)) * 1000,
          t
        )
      }
    }
  })
  txy.immediate()
}

// ---------------------------------------------------------------------------
// Restaurant zones/tables/modifiers/menu
// ---------------------------------------------------------------------------
function seedRestaurant(db: DB, branchId: string): void {
  const zIns = db.prepare('INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, ?)')
  const tIns = db.prepare(
    `INSERT INTO restaurant_tables (id, zone_id, name, capacity, shape, x, y, w, h)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const mainId = crypto.randomUUID()
  const patioId = crypto.randomUUID()
  zIns.run(mainId, branchId, 'Main Hall', 0)
  zIns.run(patioId, branchId, 'Patio', 1)
  const t = new Date().toISOString()
  const positions: [number, number][] = [
    [40, 40],
    [180, 40],
    [320, 40],
    [460, 40],
    [40, 180],
    [180, 180],
    [320, 180],
    [460, 180]
  ]
  const tx = db.transaction(() => {
    positions.forEach(([x, y], i) => {
      const isRound = i % 3 === 0
      tIns.run(
        crypto.randomUUID(),
        mainId,
        `T-${i + 1}`,
        isRound ? 2 : 4,
        isRound ? 'round' : 'square',
        x,
        y,
        90,
        90
      )
    })
    tIns.run(crypto.randomUUID(), patioId, 'P-1', 4, 'square', 60, 60, 90, 90)
    tIns.run(crypto.randomUUID(), patioId, 'P-2', 6, 'rect', 200, 60, 140, 90)

    // Modifier groups
    const gIns = db.prepare(
      'INSERT INTO modifier_groups (id, name, min_select, max_select, required) VALUES (?, ?, ?, ?, ?)'
    )
    const oIns = db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta, is_default) VALUES (?, ?, ?, ?, ?)'
    )
    const spice = crypto.randomUUID()
    gIns.run(spice, 'Spice Level', 1, 1, 1)
    for (const [name, delta, def] of [
      ['Mild', 0, 0],
      ['Medium', 0, 1],
      ['Hot', 0, 0],
      ['Extra Hot', 0, 0]
    ] as const) {
      oIns.run(crypto.randomUUID(), spice, name, delta, def)
    }
    const extras = crypto.randomUUID()
    gIns.run(extras, 'Extras', 0, 4, 0)
    for (const [name, delta] of [
      ['Extra Cheese', 8000],
      ['Garlic Bread', 6000],
      ['Side Salad', 5000],
      ['Raita', 3000]
    ] as const) {
      oIns.run(crypto.randomUUID(), extras, name, delta, 0)
    }

    // Menu products
    const catIns = db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)')
    const menuCat = crypto.randomUUID()
    catIns.run(menuCat, 'Restaurant Menu', 20)
    const mIns = db.prepare(
      `INSERT INTO products (id, sku, name, category_id, unit_id, price, cost, track_stock, created_at, updated_at)
       SELECT ?, ?, ?, ?, id, ?, ?, 0, ?, ? FROM units WHERE code = 'pc'`
    )
    const pmg = db.prepare(
      'INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)'
    )
    const menu: [string, string, number, string[]][] = [
      ['RHN-001', 'Chicken Biryani', 45000, [spice, extras]],
      ['RHN-002', 'Chicken Karahi (Half)', 95000, [spice, extras]],
      ['RHN-003', 'Beef Seekh Kabab (4pc)', 55000, [spice]],
      ['RHN-004', 'Daal Mash Makhani', 32000, [spice, extras]],
      ['RHN-005', 'Palak Paneer', 38000, [spice]],
      ['RHN-006', 'Club Sandwich', 42000, [extras]],
      ['RHN-007', 'Chicken Chow Mein', 48000, [spice]],
      ['RHN-008', 'Zinger Burger', 52000, [extras]],
      ['RHN-009', 'Malai Boti (6pc)', 68000, [spice, extras]],
      ['RHN-010', 'Fresh Lime Soda', 12000, []],
      ['RHN-011', 'Mint Margarita', 15000, []],
      ['RHN-012', 'Gulab Jamun (3pc)', 18000, []],
      ['RHN-013', 'Kheer (Cup)', 15000, []],
      ['RHN-014', 'Naan (Plain)', 6000, []],
      ['RHN-015', 'Garlic Naan', 9000, []],
      ['RHN-016', 'Chicken Corn Soup', 25000, []],
      ['RHN-017', 'Russian Salad', 20000, []],
      ['RHN-018', 'Fish & Chips', 75000, [extras]],
      ['RHN-019', 'Chicken Ala King', 72000, []],
      ['RHN-020', 'Chocolate Lava Cake', 35000, []],
      ['RHN-021', 'Ice Cream Scoop', 12000, []],
      ['RHN-022', 'Qehwa (Pot)', 20000, []],
      ['RHN-023', 'Mutton Champ (4pc)', 125000, [spice]],
      ['RHN-024', 'Vegetable Fried Rice', 35000, []],
      ['RHN-025', 'Manchow Soup', 28000, []]
    ]
    for (const [sku, name, price, groups] of menu) {
      const pid = crypto.randomUUID()
      mIns.run(pid, sku, name, menuCat, price, Math.round(price * 0.45), t, t)
      for (const g of groups) pmg.run(pid, g)
    }
  })
  tx.immediate()
}

// ---------------------------------------------------------------------------
// Customers + gift cards
// ---------------------------------------------------------------------------
function seedCustomers(db: DB): void {
  const t = new Date().toISOString()
  const customers: [string, string, string, number][] = [
    ['Ahmed Hassan', '0301-1111111', 'ahmed@example.com', 150],
    ['Fatima Noor', '0302-2222222', 'fatima@example.com', 320],
    ['Ali Raza', '0303-3333333', 'ali.r@example.com', 45],
    ['Ayesha Siddiqui', '0304-4444444', 'ayesha.s@example.com', 890],
    ['Muhammad Usman', '0305-5555555', 'usman@example.com', 210],
    ['Hira Anwar', '0306-6666666', 'hira@example.com', 120],
    ['Saad Mahmood', '0307-7777777', 'saad@example.com', 560],
    ['Zainab Tariq', '0308-8888888', 'zainab@example.com', 75],
    ['Bilal Chaudhry', '0309-9999999', 'bilal.c@example.com', 430],
    ['Mariam Yousaf', '0310-1010101', 'mariam@example.com', 195],
    ['Taha Iqbal', '0311-1111112', 'taha@example.com', 300],
    ['Noor Fatima', '0312-1212121', 'noor@example.com', 60]
  ]
  const cIns = db.prepare(
    `INSERT INTO customers (id, name, phone, email, loyalty_points, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction(() => {
    for (const [name, phone, email, pts] of customers) {
      cIns.run(crypto.randomUUID(), name, phone, email, pts, t)
    }
    const gIns = db.prepare(
      `INSERT INTO gift_cards (id, code, initial_balance, balance, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    gIns.run(crypto.randomUUID(), 'GC-DEMO-0001', 500000, 500000, t)
    gIns.run(crypto.randomUUID(), 'GC-DEMO-0002', 250000, 175000, t)
  })
  tx.immediate()
}
