import type { DB } from '../db/database'
import { hashPassword, verifyPassword } from '../security/passwords'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { SessionInfo, User, Role } from '@shared/types/models'

const now = () => new Date().toISOString()

interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  pin_hash: string | null
  role_id: string
  branch_id: string | null
  is_active: number
  last_login_at: string | null
  role_name: string
}

export class AuthService {
  private sessions = new Map<string, { userId: string; branchId: string; expiresAt: number }>()
  private attempts = new Map<string, { count: number; lockedUntil: number }>()

  constructor(private db: DB) {}

  private rowToUser(r: UserRow): User {
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      roleId: r.role_id,
      roleName: r.role_name,
      branchId: r.branch_id ?? undefined,
      pinEnabled: !!r.pin_hash,
      isActive: r.is_active === 1,
      lastLoginAt: r.last_login_at ?? undefined,
      createdAt: ''
    }
  }

  private fetchUserByUsername(username: string): UserRow | undefined {
    return this.db
      .prepare(
        `SELECT u.*, r.name AS role_name FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.username = ? COLLATE NOCASE`
      )
      .get(username) as UserRow | undefined
  }

  private fetchUserById(id: string): UserRow | undefined {
    return this.db
      .prepare(
        `SELECT u.*, r.name AS role_name FROM users u
         JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
      )
      .get(id) as UserRow | undefined
  }

  private permissionsFor(roleId: string): string[] {
    const rows = this.db
      .prepare('SELECT permission FROM role_permissions WHERE role_id = ?')
      .all(roleId) as { permission: string }[]
    return rows.map((r) => r.permission)
  }

  private defaultBranch(): string {
    const row = this.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }
    return row.id
  }

  private checkLock(key: string): void {
    const a = this.attempts.get(key)
    if (a && a.lockedUntil > Date.now()) {
      const secs = Math.ceil((a.lockedUntil - Date.now()) / 1000)
      throw new AppError(ErrorCode.TooManyAttempts, `Too many attempts. Retry in ${secs}s.`)
    }
  }

  private recordFail(key: string): void {
    const a = this.attempts.get(key) ?? { count: 0, lockedUntil: 0 }
    a.count += 1
    if (a.count >= 5) {
      a.lockedUntil = Date.now() + 5 * 60 * 1000
      a.count = 0
    }
    this.attempts.set(key, a)
  }

  login(username: string, password: string): SessionInfo {
    this.checkLock(username)
    const row = this.fetchUserByUsername(username)
    if (!row || !verifyPassword(row.password_hash, password)) {
      this.recordFail(username)
      throw new AppError(ErrorCode.Unauthorized, 'Invalid username or password.')
    }
    if (row.is_active !== 1) {
      throw new AppError(ErrorCode.Forbidden, 'This account is deactivated.')
    }
    const token = crypto.randomUUID()
    const branchId = row.branch_id ?? this.defaultBranch()
    this.sessions.set(token, {
      userId: row.id,
      branchId,
      expiresAt: Date.now() + 12 * 3600 * 1000
    })
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), row.id)
    this.db
      .prepare(
        `INSERT INTO sessions (token, user_id, branch_id, terminal_id, created_at, expires_at)
         VALUES (?, ?, ?, 'term-local-01', ?, ?)`
      )
      .run(token, row.id, branchId, now(), new Date(Date.now() + 12 * 3600 * 1000).toISOString())

    // seed terminal id — written on first login if missing
    const term = this.db
      .prepare(`SELECT id FROM terminals WHERE device_key = 'term-local-01'`)
      .get() as { id: string } | undefined
    const terminalId = term?.id ?? 'term-local-01'
    if (!term) {
      this.db
        .prepare('INSERT INTO terminals (id, branch_id, name, device_key) VALUES (?, ?, ?, ?)')
        .run('term-local-01', branchId, 'Terminal 1', 'term-local-01')
    }

    this.audit(row.id, row.username, 'auth.login', 'user', row.id, branchId)
    return this.buildSession(token, row, branchId, terminalId)
  }

  loginPin(userId: string, pin: string): SessionInfo {
    this.checkLock(userId)
    const row = this.fetchUserById(userId)
    if (!row?.pin_hash || !verifyPassword(row.pin_hash, pin)) {
      this.recordFail(userId)
      throw new AppError(ErrorCode.Unauthorized, 'Invalid PIN.')
    }
    if (row.is_active !== 1) {
      throw new AppError(ErrorCode.Forbidden, 'This account is deactivated.')
    }
    const token = crypto.randomUUID()
    const branchId = row.branch_id ?? this.defaultBranch()
    const terminalId =
      (
        this.db.prepare(`SELECT id FROM terminals WHERE device_key='term-local-01'`).get() as
          { id: string } | undefined
      )?.id ?? 'term-local-01'
    this.sessions.set(token, { userId: row.id, branchId, expiresAt: Date.now() + 43_200_000 })
    return this.buildSession(token, row, branchId, terminalId)
  }

  private buildSession(
    token: string,
    row: UserRow,
    branchId: string,
    terminalId: string
  ): SessionInfo {
    return {
      token,
      user: this.rowToUser(row),
      permissions: this.permissionsFor(row.role_id),
      branchId,
      terminalId,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      locked: false
    }
  }

  validateSession(token: string): SessionInfo | null {
    const s = this.sessions.get(token)
    if (!s) return null
    if (s.expiresAt < Date.now()) {
      this.sessions.delete(token)
      return null
    }
    const row = this.fetchUserById(s.userId)
    if (!row || row.is_active !== 1) return null
    return {
      token,
      user: this.rowToUser(row),
      permissions: this.permissionsFor(row.role_id),
      branchId: s.branchId,
      terminalId: 'term-local-01',
      expiresAt: new Date(s.expiresAt).toISOString(),
      locked: false
    }
  }

  logout(token: string): void {
    const s = this.sessions.get(token)
    if (s) {
      this.audit(s.userId, undefined, 'auth.logout', 'session', token)
      this.sessions.delete(token)
    }
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE token = ?').run(now(), token)
  }

  hasPermission(token: string, permission: string): boolean {
    const s = this.sessions.get(token)
    if (!s || s.expiresAt < Date.now()) return false
    const row = this.fetchUserById(s.userId)
    if (!row) return false
    return this.permissionsFor(row.role_id).includes(permission)
  }

  /** Verify a manager PIN against any active user holding `permission`. */
  verifyOverride(pin: string, permission: string): string {
    // Rate-limit: without this the override endpoint is an online PIN oracle
    // (iterate ~10k values). Keyed by permission since no user is supplied.
    const lockKey = `override:${permission}`
    this.checkLock(lockKey)
    const rows = this.db
      .prepare(`SELECT id FROM users WHERE is_active = 1 AND pin_hash IS NOT NULL`)
      .all() as { id: string }[]
    for (const { id } of rows) {
      const row = this.fetchUserById(id)
      if (!row?.pin_hash) continue
      if (!this.permissionsFor(row.role_id).includes(permission)) continue
      if (verifyPassword(row.pin_hash, pin)) {
        this.audit(id, row.username, 'auth.override', 'override', undefined, undefined, {
          permission
        })
        return row.id
      }
    }
    this.recordFail(lockKey)
    this.audit(undefined, undefined, 'auth.override_denied', 'override', undefined, undefined, {
      permission
    })
    throw new AppError(ErrorCode.Forbidden, 'Manager authorization failed.')
  }

  changePassword(userId: string, oldPw: string, newPw: string): void {
    const row = this.fetchUserById(userId)
    if (!row || !verifyPassword(row.password_hash, oldPw)) {
      throw new AppError(ErrorCode.Unauthorized, 'Current password is incorrect.')
    }
    if (newPw.length < 8) {
      throw new AppError(ErrorCode.Validation, 'Password must be at least 8 characters.')
    }
    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPw), userId)
    this.audit(userId, row.username, 'auth.changePassword', 'user', userId)
  }

  setPin(userId: string, pin: string): void {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new AppError(ErrorCode.Validation, 'PIN must be 4–8 digits.')
    }
    this.db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPassword(pin), userId)
  }

  audit(
    actorId: string | undefined,
    actorName: string | undefined = 'system',
    action: string,
    entity: string,
    entityId?: string,
    branchId?: string,
    context?: Record<string, unknown>
  ): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, branch_id, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        actorId ?? null,
        actorName ?? 'system',
        action,
        entity,
        entityId ?? null,
        branchId ?? null,
        context ? JSON.stringify(context) : null,
        now()
      )
  }

  listRoles(): Role[] {
    const roles = this.db.prepare('SELECT * FROM roles ORDER BY name').all() as {
      id: string
      name: string
      description: string | null
      is_system: number
    }[]
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      isSystem: r.is_system === 1,
      permissions: this.permissionsFor(r.id)
    }))
  }

  listUsers(): User[] {
    const rows = this.db
      .prepare(
        `SELECT u.*, r.name AS role_name FROM users u
         JOIN roles r ON r.id = u.role_id ORDER BY u.display_name`
      )
      .all() as UserRow[]
    return rows.map((r) => this.rowToUser(r))
  }
}
