import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { DB } from '../db/database'

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
})

const pinSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/)
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
})

export const registerAuthIpc = (services: Services, sessionStore: SessionStore): void => {
  const auth = services.auth

  handle(
    IpcChannel.AuthLogin,
    {
      schema: loginSchema,
      handler: (_ctx, input: { username: string; password: string }) => {
        const session = auth.login(input.username, input.password)
        sessionStore.set(session)
        return session
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthLoginPin,
    {
      schema: pinSchema,
      handler: (_ctx, input: { userId: string; pin: string }) => {
        const session = auth.loginPin(input.userId, input.pin)
        sessionStore.set(session)
        return session
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthLogout,
    {
      handler: () => {
        const s = sessionStore.get()
        if (s) auth.logout(s.token)
        sessionStore.clear()
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthSession,
    {
      handler: () => sessionStore.get()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthChangePassword,
    {
      schema: changePasswordSchema,
      handler: (ctx, input: { oldPassword: string; newPassword: string }) => {
        if (!ctx.session) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
        auth.changePassword(ctx.session.user.id, input.oldPassword, input.newPassword)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthChangePin,
    {
      schema: z.object({ pin: z.string().regex(/^\d{4,8}$/) }),
      handler: (ctx, input: { pin: string }) => {
        if (!ctx.session) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
        auth.setPin(ctx.session.user.id, input.pin)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthHasPermission,
    {
      schema: z.object({ permission: z.string() }),
      handler: (ctx, input: { permission: string }) => {
        if (!ctx.session) return false
        return auth.hasPermission(ctx.session.token, input.permission)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthRequireOverride,
    {
      schema: z.object({ pin: z.string(), permission: z.string() }),
      handler: (_ctx, input: { pin: string; permission: string }) =>
        auth.verifyOverride(input.pin, input.permission)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuthListUsers,
    {
      permission: 'users.view',
      handler: () => auth.listUsers()
    },
    services,
    () => sessionStore.get()
  )

  // users:list / roles:list are the Settings-UI facing aliases
  handle(
    IpcChannel.UsersList,
    {
      permission: 'users.view',
      handler: () => auth.listUsers()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RolesList,
    {
      permission: 'users.view',
      handler: () => auth.listRoles()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AuditList,
    {
      permission: 'audit.view',
      schema: z.object({
        search: z.string().max(120).optional(),
        action: z.string().max(80).optional(),
        entity: z.string().max(60).optional(),
        userId: z.string().uuid().optional(),
        from: z.string().max(40).optional(),
        to: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().nonnegative().optional()
      }),
      handler: (
        _ctx,
        q: {
          search?: string
          action?: string
          entity?: string
          userId?: string
          from?: string
          to?: string
          limit?: number
          offset?: number
        }
      ) => {
        const db = services.db as DB
        const where: string[] = []
        const params: unknown[] = []
        if (q.search) {
          where.push(
            `(LOWER(action) LIKE ? ESCAPE '\\' OR LOWER(entity) LIKE ? ESCAPE '\\' OR LOWER(actor_name) LIKE ? ESCAPE '\\')`
          )
          const pat = `%${q.search.toLowerCase().replace(/([%_\\])/g, '\\$1')}%`
          params.push(pat, pat, pat)
        }
        if (q.action) {
          where.push('action = ?')
          params.push(q.action)
        }
        if (q.entity) {
          where.push('entity = ?')
          params.push(q.entity)
        }
        if (q.userId) {
          where.push('actor_id = ?')
          params.push(q.userId)
        }
        if (q.from) {
          where.push('created_at >= ?')
          params.push(q.from)
        }
        if (q.to) {
          where.push('created_at <= ?')
          params.push(q.to)
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const total = (
          db.prepare(`SELECT COUNT(*) c FROM audit_log ${whereSql}`).get(...params) as { c: number }
        ).c
        const limit = q.limit ?? 100
        const offset = q.offset ?? 0
        const rows = db
          .prepare(
            `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
          )
          .all(...params, limit, offset) as {
          id: string
          actor_id: string | null
          actor_name: string | null
          action: string
          entity: string
          entity_id: string | null
          branch_id: string | null
          terminal_id: string | null
          context: string | null
          created_at: string
        }[]
        return {
          items: rows.map((r) => ({
            id: r.id,
            actorId: r.actor_id ?? undefined,
            actorName: r.actor_name ?? undefined,
            action: r.action,
            entity: r.entity,
            entityId: r.entity_id ?? undefined,
            branchId: r.branch_id ?? undefined,
            terminalId: r.terminal_id ?? undefined,
            context: r.context ? (JSON.parse(r.context) as Record<string, unknown>) : undefined,
            createdAt: r.created_at
          })),
          total,
          limit,
          offset
        }
      }
    },
    services,
    () => sessionStore.get()
  )
}
