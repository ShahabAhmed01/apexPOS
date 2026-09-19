import type { DB } from './database'
import { SCHEMA_0001 } from './schema'

interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  { id: 1, name: '0001_initial', sql: SCHEMA_0001 },
  {
    id: 2,
    name: '0002_refund_tracking',
    sql: `
      -- Track partial refunds per payment and record the settlement method of
      -- each refund so reporting and ledger reconciliation are truthful.
      ALTER TABLE payments ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE refunds ADD COLUMN method TEXT NOT NULL DEFAULT 'original';
    `
  }
]

export const runMigrations = (db: DB): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `)
  const applied = new Set(
    (db.prepare('SELECT id FROM migrations').all() as { id: number }[]).map((r) => r.id)
  )
  const insert = db.prepare('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)')
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue
    const tx = db.transaction(() => {
      db.exec(m.sql)
      insert.run(m.id, m.name, new Date().toISOString())
    })
    tx.immediate()
  }
}
