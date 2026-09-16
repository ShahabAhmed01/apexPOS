import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runMigrations } from './migrator'

export type DB = Database.Database

export interface DbContext {
  db: DB
  path: string
  close: () => void
}

/**
 * Open (creating if necessary) the SQLite database at the given path,
 * apply WAL + integrity pragmas, and run pending migrations.
 */
export const openDatabase = (path: string): DbContext => {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -16000')
  db.pragma('mmap_size = 30000000000')
  runMigrations(db)
  return { db, path, close: () => db.close() }
}

/**
 * Execute `fn` inside an IMMEDIATE transaction, returning its result.
 * Commits on success, rolls back on any throw. Nested calls join the
 * outer transaction (better-sqlite3 handles this via savepoints).
 */
export const transaction = <T>(db: DB, fn: () => T): T => {
  return db.transaction(fn).immediate() as T
}
