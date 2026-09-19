import type { DB } from '../db/database'
import type { Customer, GiftCard } from '@shared/types/models'
import { AppError, ErrorCode } from '@shared/lib/errors'

export interface CustomerInput {
  id?: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  tags?: string[]
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  tags: string
  loyalty_points: number
  store_credit: number
  is_active: number
  created_at: string
  total_spent: number | null
  order_count: number | null
  last_order_at: string | null
}

const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  address: r.address ?? undefined,
  notes: r.notes ?? undefined,
  tags: JSON.parse(r.tags) as string[],
  loyaltyPoints: r.loyalty_points,
  storeCredit: r.store_credit,
  totalSpent: r.total_spent ?? 0,
  orderCount: r.order_count ?? 0,
  lastOrderAt: r.last_order_at ?? undefined,
  isActive: r.is_active === 1,
  createdAt: r.created_at
})

const BASE_SELECT = `
  SELECT c.*,
    (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS total_spent,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS order_count,
    (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS last_order_at
  FROM customers c`

export class CustomerService {
  constructor(private db: DB) {}

  list(search?: string): Customer[] {
    let sql = BASE_SELECT
    const params: string[] = []
    if (search) {
      sql += ` WHERE LOWER(c.name) LIKE ? OR c.phone LIKE ? OR LOWER(c.email) LIKE ?`
      const pat = `%${search.toLowerCase()}%`
      params.push(pat, `%${search}%`, pat)
    }
    sql += ` ORDER BY c.name LIMIT 500`
    return (this.db.prepare(sql).all(...params) as CustomerRow[]).map(toCustomer)
  }

  get(id: string): Customer {
    const row = this.db.prepare(`${BASE_SELECT} WHERE c.id = ?`).get(id) as CustomerRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, 'Customer not found.')
    return toCustomer(row)
  }

  save(input: CustomerInput): Customer {
    const now = new Date().toISOString()
    if (input.id) {
      const existing = this.db.prepare('SELECT id FROM customers WHERE id = ?').get(input.id)
      if (!existing) throw new AppError(ErrorCode.NotFound, 'Customer not found.')
      this.db
        .prepare(
          `UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, tags=? WHERE id=?`
        )
        .run(
          input.name,
          input.phone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.notes ?? null,
          JSON.stringify(input.tags ?? []),
          input.id
        )
      return this.get(input.id)
    }
    const id = crypto.randomUUID()
    this.db
      .prepare(
        `INSERT INTO customers (id, name, phone, email, address, notes, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.phone ?? null,
        input.email ?? null,
        input.address ?? null,
        input.notes ?? null,
        JSON.stringify(input.tags ?? []),
        now
      )
    return this.get(id)
  }

  /** Delta-based loyalty adjustment; writes an auditable transaction row. */
  adjustLoyalty(customerId: string, delta: number, reason: string): number {
    if (delta === 0) throw new AppError(ErrorCode.Validation, 'Delta must be non-zero.')
    if (!reason.trim()) throw new AppError(ErrorCode.Validation, 'Reason is required.')
    const c = this.db
      .prepare('SELECT loyalty_points FROM customers WHERE id = ?')
      .get(customerId) as { loyalty_points: number } | undefined
    if (!c) throw new AppError(ErrorCode.NotFound, 'Customer not found.')
    const next = c.loyalty_points + delta
    if (next < 0) throw new AppError(ErrorCode.Validation, 'Loyalty balance cannot go negative.')

    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE customers SET loyalty_points = ? WHERE id = ?').run(next, customerId)
      this.db
        .prepare(
          `INSERT INTO loyalty_transactions (id, customer_id, delta, balance, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(crypto.randomUUID(), customerId, delta, next, reason.trim(), new Date().toISOString())
    })
    tx.immediate()
    return next
  }

  adjustStoreCredit(
    customerId: string,
    delta: number,
    reason: string,
    refType?: string,
    refId?: string
  ): number {
    if (delta === 0) throw new AppError(ErrorCode.Validation, 'Delta must be non-zero.')
    const c = this.db.prepare('SELECT store_credit FROM customers WHERE id = ?').get(customerId) as
      { store_credit: number } | undefined
    if (!c) throw new AppError(ErrorCode.NotFound, 'Customer not found.')
    const next = c.store_credit + delta
    if (next < 0) throw new AppError(ErrorCode.Validation, 'Store credit cannot go negative.')

    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE customers SET store_credit = ? WHERE id = ?').run(next, customerId)
      this.db
        .prepare(
          `INSERT INTO store_credit_transactions (id, customer_id, delta, balance, reason, ref_type, ref_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          crypto.randomUUID(),
          customerId,
          delta,
          next,
          reason,
          refType ?? null,
          refId ?? null,
          new Date().toISOString()
        )
    })
    tx.immediate()
    return next
  }

  listGiftCards(): GiftCard[] {
    const rows = this.db.prepare('SELECT * FROM gift_cards ORDER BY created_at DESC').all() as {
      id: string
      code: string
      initial_balance: number
      balance: number
      status: string
      expires_at: string | null
      created_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      initialBalance: r.initial_balance,
      balance: r.balance,
      status: r.status as GiftCard['status'],
      expiresAt: r.expires_at ?? undefined,
      createdAt: r.created_at
    }))
  }

  issueGiftCard(code: string, amount: number): GiftCard {
    if (amount <= 0) throw new AppError(ErrorCode.Validation, 'Amount must be positive.')
    const exists = this.db.prepare('SELECT id FROM gift_cards WHERE code = ?').get(code)
    if (exists) throw new AppError(ErrorCode.Conflict, 'Gift card code already exists.')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO gift_cards (id, code, initial_balance, balance, status, created_at)
           VALUES (?, ?, ?, ?, 'active', ?)`
        )
        .run(id, code, amount, amount, now)
      this.db
        .prepare(
          `INSERT INTO gift_card_transactions (id, card_id, delta, balance, ref_type, created_at)
           VALUES (?, ?, ?, ?, 'issue', ?)`
        )
        .run(crypto.randomUUID(), id, amount, amount, now)
    })
    tx.immediate()
    return this.getGiftCard(code)
  }

  getGiftCard(code: string): GiftCard {
    const r = this.db.prepare('SELECT * FROM gift_cards WHERE code = ?').get(code) as
      | {
          id: string
          code: string
          initial_balance: number
          balance: number
          status: string
          expires_at: string | null
          created_at: string
        }
      | undefined
    if (!r) throw new AppError(ErrorCode.NotFound, 'Gift card not found.')
    return {
      id: r.id,
      code: r.code,
      initialBalance: r.initial_balance,
      balance: r.balance,
      status: r.status as GiftCard['status'],
      expiresAt: r.expires_at ?? undefined,
      createdAt: r.created_at
    }
  }
}
