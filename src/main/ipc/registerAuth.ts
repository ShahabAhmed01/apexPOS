import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'

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

  handle(IpcChannel.AuthLogin, {
    schema: loginSchema,
    handler: (_ctx, input: { username: string; password: string }) => {
      const session = auth.login(input.username, input.password)
      sessionStore.set(session)
      return session
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthLoginPin, {
    schema: pinSchema,
    handler: (_ctx, input: { userId: string; pin: string }) => {
      const session = auth.loginPin(input.userId, input.pin)
      sessionStore.set(session)
      return session
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthLogout, {
    handler: () => {
      const s = sessionStore.get()
      if (s) auth.logout(s.token)
      sessionStore.clear()
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthSession, {
    handler: () => sessionStore.get()
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthChangePassword, {
    schema: changePasswordSchema,
    handler: (ctx, input: { oldPassword: string; newPassword: string }) => {
      if (!ctx.session) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
      auth.changePassword(ctx.session.user.id, input.oldPassword, input.newPassword)
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthChangePin, {
    schema: z.object({ pin: z.string().regex(/^\d{4,8}$/) }),
    handler: (ctx, input: { pin: string }) => {
      if (!ctx.session) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
      auth.setPin(ctx.session.user.id, input.pin)
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthHasPermission, {
    schema: z.object({ permission: z.string() }),
    handler: (ctx, input: { permission: string }) => {
      if (!ctx.session) return false
      return auth.hasPermission(ctx.session.token, input.permission)
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthRequireOverride, {
    schema: z.object({ pin: z.string(), permission: z.string() }),
    handler: (_ctx, input: { pin: string; permission: string }) =>
      auth.verifyOverride(input.pin, input.permission)
  }, services, () => sessionStore.get())

  handle(IpcChannel.AuthListUsers, {
    permission: 'users.view',
    handler: () => auth.listUsers()
  }, services, () => sessionStore.get())
}
