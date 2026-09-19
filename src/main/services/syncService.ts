import type { DB } from '../db/database'

const now = (): string => new Date().toISOString()
const newId = (): string => crypto.randomUUID()

/**
 * Local synchronization outbox.
 *
 * IMPORTANT — scope honesty: APEXPOS currently has NO central sync server.
 * This service provides the transport-independent half of synchronization:
 * durable local operation queueing with idempotent op identity, ordered
 * persistence, and replay/export. Whether anything is "synced" depends on a
 * real remote target existing — and none does. `status()` therefore never
 * reports more than pending local state; see docs/OFFLINE_SYNC.md.
 */
export type SyncState =
  | 'offline' // no transport configured and/or no connectivity
  | 'online'
  | 'syncing'
  | 'synced'
  | 'delayed'
  | 'failed'

export interface SyncStatus {
  /** A real remote endpoint has been configured. Always false today. */
  configured: boolean
  state: SyncState
  pending: number
  failed: number
  oldestPendingAt: string | null
}

export interface OutboxOp {
  id: string
  opId: string
  entity: string
  entityId: string
  action: string
  payload: Record<string, unknown>
  attempts: number
  createdAt: string
}

interface OutboxRow {
  id: string
  op_id: string
  entity: string
  entity_id: string
  action: string
  payload: string
  attempts: number
  created_at: string
  synced_at: string | null
}

export class SyncService {
  constructor(private db: DB) {}

  /**
   * Enqueue a domain operation for a (future) remote sync. Idempotent by
   * opId — repeating an opId is a no-op, which makes client retries and
   * main-process replays safe. Runs inside the caller's transaction so an
   * operation is never committed without being queued (or vice versa).
   */
  enqueue(
    opId: string,
    entity: string,
    entityId: string,
    action: string,
    payload: Record<string, unknown>
  ): void {
    this.db
      .prepare(
        `INSERT INTO sync_outbox (id, op_id, entity, entity_id, action, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(op_id) DO NOTHING`
      )
      .run(newId(), opId, entity, entityId, action, JSON.stringify(payload), now())
  }

  status(): SyncStatus {
    const pending = this.db
      .prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE synced_at IS NULL')
      .get() as { c: number }
    const failed = this.db
      .prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE synced_at IS NULL AND attempts > 0')
      .get() as { c: number }
    const oldest = this.db
      .prepare(
        'SELECT created_at FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at LIMIT 1'
      )
      .get() as { created_at: string } | undefined

    // No remote target exists: the truthful state is never "synced".
    const state: SyncState =
      pending.c === 0 ? 'offline' : failed.c > 0 ? 'failed' : 'delayed' // would flush, no target
    return {
      configured: false,
      state: pending.c === 0 ? 'offline' : state,
      pending: pending.c,
      failed: failed.c,
      oldestPendingAt: oldest?.created_at ?? null
    }
  }

  /** All pending ops in enqueue order (for export/replay tooling and tests). */
  pendingOps(): OutboxOp[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at, rowid')
      .all() as OutboxRow[]
    return rows.map((r) => ({
      id: r.id,
      opId: r.op_id,
      entity: r.entity,
      entityId: r.entity_id,
      action: r.action,
      payload: JSON.parse(r.payload) as Record<string, unknown>,
      attempts: r.attempts,
      createdAt: r.created_at
    }))
  }

  /** Record a delivery attempt; a `null` error marks the op synced. */
  recordAttempt(opId: string, error: string | null): void {
    if (error === null) {
      this.db
        .prepare('UPDATE sync_outbox SET synced_at = ? WHERE op_id = ?')
        .run(now(), opId)
    } else {
      this.db
        .prepare('UPDATE sync_outbox SET attempts = attempts + 1 WHERE op_id = ?')
        .run(opId)
    }
  }
}
