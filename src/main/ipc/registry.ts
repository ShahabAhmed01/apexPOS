import { ipcMain } from 'electron'
import type { ZodError} from 'zod';
import { type ZodType } from 'zod'
import { AppError, ErrorCode, toErrorMessage } from '@shared/lib/errors'
import { ipcOk, ipcErr, type IpcResult } from '@shared/ipc/envelope'
import type { SessionInfo } from '@shared/types/models'
import type { AuthService } from '../services/authService'

export interface HandlerContext {
  session: SessionInfo | null
  services: Services
}

export interface Services {
  auth: AuthService
  [key: string]: unknown
}

interface HandlerOptions<A extends unknown[], R> {
  /** Permission key required, or omit for public handlers (login, app info). */
  permission?: string
  /** Grant if the caller has ANY of these permissions (e.g. catalog browsing). */
  anyOfPermissions?: string[]
  schema?: ZodType
  handler: (ctx: HandlerContext, ...args: A) => Promise<R> | R
}

/**
 * Register an IPC handler that:
 *  1. validates the payload with zod (when a schema is provided)
 *  2. enforces permission via AuthService (when `permission` is set)
 *  3. maps all errors onto the IpcResult envelope
 */
export const handle = <A extends unknown[], R>(
  channel: string,
  opts: HandlerOptions<A, R>,
  services: Services,
  getSession: () => SessionInfo | null
): void => {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<R>> => {
    try {
      let payload: unknown[] = args

      if (opts.schema) {
        const parsed = opts.schema.safeParse(args.length <= 1 ? args[0] : args)
        if (!parsed.success) {
          throw new AppError(ErrorCode.Validation, 'Invalid request payload.', formatZod(parsed.error))
        }
        payload = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
      }

      const session = getSession()
      if (opts.permission || opts.anyOfPermissions) {
        if (!session) {
          throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
        }
        if (opts.permission && !services.auth.hasPermission(session.token, opts.permission)) {
          throw new AppError(ErrorCode.Forbidden, `Missing permission: ${opts.permission}`)
        }
        if (opts.anyOfPermissions) {
          const ok = opts.anyOfPermissions.some((p) =>
            services.auth.hasPermission(session.token, p)
          )
          if (!ok) {
            throw new AppError(ErrorCode.Forbidden, `Missing any of: ${opts.anyOfPermissions.join(', ')}`)
          }
        }
      }

      const data = await opts.handler({ session, services }, ...(payload as A))
      return ipcOk(data as R)
    } catch (e) {
      if (e instanceof AppError) {
        return ipcErr({ code: e.code, message: e.message, details: e.details })
      }
      console.error(`[ipc:${channel}] unhandled error`, e)
      return ipcErr({ code: ErrorCode.Internal, message: toErrorMessage(e) })
    }
  })
}

const formatZod = (z: ZodError): unknown =>
  z.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
