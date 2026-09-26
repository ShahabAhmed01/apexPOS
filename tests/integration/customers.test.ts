import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { CustomerService } from '@main/services/customerService'
import { execSync } from 'node:child_process'

let ctx: DbContext
let customers: CustomerService

beforeAll(() => {
  execSync(`rm -f /tmp/opencode/apex/customers-${process.pid}.db*; mkdir -p /tmp/opencode/apex`)
  ctx = openDatabase(`/tmp/opencode/apex/customers-${process.pid}.db`)
  seedIfEmpty(ctx.db)
  customers = new CustomerService(ctx.db)
})

afterAll(() => ctx.close())

describe('CustomerService', () => {
  it('lists seeded customers and searches by name/phone', () => {
    const all = customers.list()
    expect(all.length).toBeGreaterThanOrEqual(8)
    const first = all[0]!
    expect(first.loyaltyPoints).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(first.tags)).toBe(true)

    const byName = customers.list('a')
    for (const c of byName) {
      const hay = `${c.name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase()
      expect(hay).toContain('a')
    }
  })

  it('creates and updates a customer', () => {
    const created = customers.save({ name: 'Test Person', phone: '0300-1234567', tags: ['vip'] })
    expect(created.id).toBeTruthy()
    expect(created.tags).toEqual(['vip'])

    const updated = customers.save({
      id: created.id,
      name: 'Test Person',
      phone: '0311-9999999',
      tags: ['vip', 'corporate']
    })
    expect(updated.phone).toBe('0311-9999999')
    expect(updated.tags).toEqual(['vip', 'corporate'])
  })

  it('adjusts loyalty points with audit trail and rejects overdraw', () => {
    const c = customers.save({ name: 'Loyalty Tester' })
    const next = customers.adjustLoyalty(c.id, 250, 'Welcome bonus')
    expect(next).toBe(250)

    const txCount = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM loyalty_transactions WHERE customer_id = ?')
      .get(c.id) as { n: number }
    expect(txCount.n).toBe(1)

    expect(() => customers.adjustLoyalty(c.id, -999, 'Nope')).toThrow(/negative/i)
    expect(() => customers.adjustLoyalty(c.id, 0, 'Zero')).toThrow()
    const after = customers.get(c.id)
    expect(after.loyaltyPoints).toBe(250)
  })

  it('issues gift cards and reads balance; rejects duplicate codes', () => {
    const card = customers.issueGiftCard('TEST-0001', 5000_00)
    expect(card.balance).toBe(5000_00)
    expect(card.status).toBe('active')

    const bal = customers.getGiftCard('TEST-0001').balance
    expect(bal).toBe(5000_00)

    expect(() => customers.issueGiftCard('TEST-0001', 100)).toThrow(/exists/i)

    const txBal = ctx.db
      .prepare('SELECT balance FROM gift_card_transactions WHERE card_id = ?')
      .get(card.id) as { balance: number }
    expect(txBal.balance).toBe(5000_00)
  })
})
