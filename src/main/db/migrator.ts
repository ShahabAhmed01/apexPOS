import type { DB } from './database'
import { SCHEMA_0001 } from './schema'

interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [{ id: 1, name: '0001_initial', sql: SCHEMA_0001 }]

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
