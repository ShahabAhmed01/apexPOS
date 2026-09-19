import type { DB } from '../db/database'
import { AppError, ErrorCode } from '@shared/lib/errors'
import { add, sub } from '@shared/lib/money'
import type { Shift } from '@shared/types/models'
import type { AuthService } from './authService'

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

export class RegisterService {
  constructor(
    private db: DB,
    private auth: AuthService,
    private branchId: string
  ) {}

  open(registerId: string, openingFloat: number, userId: string): Shift {
    const register = this.db
      .prepare('SELECT id FROM registers WHERE id = ? AND branch_id = ? AND is_active = 1')
      .get(registerId, this.branchId)
    if (!register) {
      throw new AppError(ErrorCode.NotFound, `Register not found: ${registerId}`)
    }
    const active = this.db
      .prepare(`SELECT id FROM shifts WHERE register_id = ? AND status = 'open'`)
      .get(registerId)
    if (active) {
      throw new AppError(ErrorCode.InvalidState, 'This register already has an open shift.')
    }
    const sid = id()
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO shifts (id, branch_id, register_id, user_id, opening_float, opened_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(sid, this.branchId, registerId, userId, openingFloat, now())
      this.auth.audit(userId, undefined, 'register.open', 'shift', sid, this.branchId, {
        registerId,
        openingFloat
      })
    })
    tx.immediate()
    return this.current(registerId)!
  }

  current(registerId: string): Shift | null {
    const row = this.db
      .prepare(`SELECT * FROM shifts WHERE register_id = ? AND status = 'open'`)
      .get(registerId) as ShiftRow | undefined
    return row ? this.toShift(row) : null
  }

  listOpen(): Shift[] {
    const rows = this.db
      .prepare(`SELECT * FROM shifts WHERE status = 'open' AND branch_id = ?`)
      .all(this.branchId) as ShiftRow[]
    return rows.map((r) => this.toShift(r))
  }

  payIn(shiftId: string, amount: number, reason: string, userId: string): void {
    if (amount <= 0) throw new AppError(ErrorCode.Validation, 'Pay-in amount must be positive.')
    this.db
      .prepare(
        `INSERT INTO cash_movements (id, shift_id, kind, amount, reason, user_id, created_at) VALUES (?, ?, 'pay_in', ?, ?, ?, ?)`
      )
      .run(id(), shiftId, amount, reason, userId, now())
    this.auth.audit(userId, undefined, 'cash.pay_in', 'shift', shiftId, this.branchId, {
      amount,
      reason
    })
  }

  payOut(shiftId: string, amount: number, reason: string, userId: string): void {
    if (amount <= 0) throw new AppError(ErrorCode.Validation, 'Pay-out amount must be positive.')
    this.db
      .prepare(
        `INSERT INTO cash_movements (id, shift_id, kind, amount, reason, user_id, created_at) VALUES (?, ?, 'pay_out', ?, ?, ?, ?)`
      )
      .run(id(), shiftId, amount, reason, userId, now())
    this.auth.audit(userId, undefined, 'cash.pay_out', 'shift', shiftId, this.branchId, {
      amount,
      reason
    })
  }

  /**
   * Expected cash for a shift: opening float + cash sales − refunds
   * + pay-ins − pay-outs.
   */
  expectedCash(shiftId: string): number {
    const shift = this.shift(shiftId)
    const cashSalesQ = this.db
      .prepare(
        `SELECT COALESCE(SUM(p.amount), 0) - COALESCE(SUM(p.change_amount), 0) AS net
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = ? AND p.method = 'cash' AND p.status = 'approved'`
      )
      .get(shiftId) as { net: number }
    const refundsQ = this.db
      .prepare(
        `SELECT COALESCE(SUM(r.total), 0) AS total FROM refunds r
         JOIN orders o ON o.id = r.order_id WHERE o.shift_id = ?`
      )
      .get(shiftId) as { total: number }
    const movementsQ = this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN kind='pay_in' THEN amount WHEN kind='pay_out' THEN -amount ELSE 0 END), 0) AS net
         FROM cash_movements WHERE shift_id = ?`
      )
      .get(shiftId) as { net: number }
    return sub(add(shift.opening_float, cashSalesQ.net) as number, refundsQ.total) + movementsQ.net
  }

  close(registerId: string, countedCash: number, userId: string, note?: string): Shift {
    const shift = this.current(registerId)
    if (!shift) throw new AppError(ErrorCode.NotFound, 'No open shift for this register.')

    const expected = this.expectedCash(shift.id)
    const variance = sub(countedCash, expected)
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE shifts SET status = 'closed', closed_at = ?, expected_cash = ?, counted_cash = ?, variance = ?, note = COALESCE(?, note)
           WHERE id = ?`
        )
        .run(now(), expected, countedCash, variance, note ?? null, shift.id)
      this.auth.audit(userId, undefined, 'register.close', 'shift', shift.id, this.branchId, {
        expected,
        counted: countedCash,
        variance
      })
    })
    tx.immediate()
    return this.byId(shift.id)
  }

  byId(shiftId: string): Shift {
    const row = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as ShiftRow
    return this.toShift(row)
  }

  list(limit = 50): Shift[] {
    const rows = this.db
      .prepare(`SELECT * FROM shifts WHERE branch_id = ? ORDER BY opened_at DESC LIMIT ?`)
      .all(this.branchId, limit) as ShiftRow[]
    return rows.map((r) => this.toShift(r))
  }

  private shift(shiftId: string): { opening_float: number } {
    const row = this.db.prepare('SELECT opening_float FROM shifts WHERE id = ?').get(shiftId) as
      { opening_float: number } | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Shift not found: ${shiftId}`)
    return row
  }

  private toShift(r: ShiftRow): Shift {
    return {
      id: r.id,
      branchId: r.branch_id,
      registerId: r.register_id,
      userId: r.user_id,
      status: r.status as Shift['status'],
      openingFloat: r.opening_float,
      expectedCash: r.expected_cash ?? undefined,
      countedCash: r.counted_cash ?? undefined,
      variance: r.variance ?? undefined,
      openedAt: r.opened_at,
      closedAt: r.closed_at ?? undefined,
      note: r.note ?? undefined
    }
  }
}

interface ShiftRow {
  id: string
  branch_id: string
  register_id: string
  user_id: string
  status: string
  opening_float: number
  expected_cash: number | null
  counted_cash: number | null
  variance: number | null
  opened_at: string
  closed_at: string | null
  note: string | null
}
