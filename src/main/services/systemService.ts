import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { DB } from '../db/database'
import type { AppNotification } from '@shared/types/models'

export interface BackupFile {
  file: string
  createdAt: string
  sizeBytes: number
}

/**
 * Settings/notifications/backups — household IPC for the settings screen.
 */
export class SystemService {
  constructor(
    private db: DB,
    private dataDir: string
  ) {}

  notifications(unreadOnly?: boolean): AppNotification[] {
    let sql = 'SELECT * FROM notifications'
    if (unreadOnly) sql += ' WHERE is_read = 0'
    sql += ' ORDER BY created_at DESC LIMIT 100'
    const rows = this.db.prepare(sql).all() as {
      id: string
      kind: string
      severity: string
      title: string
      body: string | null
      entity: string | null
      entity_id: string | null
      is_read: number
      created_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity as AppNotification['severity'],
      title: r.title,
      body: r.body ?? undefined,
      entity: r.entity ?? undefined,
      entityId: r.entity_id ?? undefined,
      isRead: r.is_read === 1,
      createdAt: r.created_at
    }))
  }

  markNotificationRead(id: string): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
  }

  createBackup(): BackupFile {
    const backupDir = join(this.dataDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(backupDir, `apexpos-${stamp}.db`)
    // Checkpoint WAL first so the DB file alone is a complete, consistent
    // snapshot; then copy exactly once under the app's own write mutex.
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(join(this.dataDir, 'apexpos.db'), target)
    const size = statSync(target).size
    return { file: target, createdAt: new Date().toISOString(), sizeBytes: size }
  }

  listBackups(): BackupFile[] {
    const backupDir = join(this.dataDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    return readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const s = statSync(join(backupDir, f))
        return { file: join(backupDir, f), createdAt: s.mtime.toISOString(), sizeBytes: s.size }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Restore = atomically replace the live DB (app restarts afterwards). */
  restoreBackup(file: string): void {
    // Path traversal guard: only plain backup filenames inside the managed
    // backups directory are restorable.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.db$/.test(file)) {
      throw new Error(`Invalid backup filename: ${file}`)
    }
    const backupDir = resolve(this.dataDir, 'backups')
    const src = resolve(backupDir, file)
    if (dirname(src) !== backupDir || !existsSync(src)) {
      throw new Error(`Backup not found: ${file}`)
    }
    const target = join(this.dataDir, 'apexpos.db')
    const tmp = `${target}.restoring`
    copyFileSync(src, tmp)
    renameSync(tmp, target)
  }
}
