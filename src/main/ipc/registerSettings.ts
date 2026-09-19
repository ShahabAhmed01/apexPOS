import { z } from 'zod'
import { app } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { SettingsService } from '../services/settingsService'
import type { SystemService } from '../services/systemService'

export const registerSettingsIpc = (services: Services, sessionStore: SessionStore): void => {
  const settings = services.settings as SettingsService
  const system = services.system as SystemService

  handle(
    IpcChannel.SettingsGet,
    {
      requiresAuth: true,
      schema: z.object({ key: z.string().min(1).max(128) }),
      handler: (_ctx, input: { key: string }) => settings.get(input.key as never)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.SettingsSet,
    {
      permission: 'settings.manage',
      schema: z.object({ key: z.string().min(1).max(128), value: z.unknown() }),
      handler: (ctx, input: { key: string; value: unknown }) => {
        settings.set(input.key as never, input.value as never)
        const auth = services.auth
        auth.audit(ctx.session!.user.id, undefined, 'settings.set', 'setting', input.key)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.SettingsAll,
    {
      requiresAuth: true,
      handler: () => settings.all()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.NotificationsList,
    {
      requiresAuth: true,
      schema: z.object({ unreadOnly: z.boolean().optional() }).optional(),
      handler: (_ctx, input?: { unreadOnly?: boolean }) => system.notifications(input?.unreadOnly)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.NotificationsMarkRead,
    {
      requiresAuth: true,
      schema: z.object({ id: z.string().min(1) }),
      handler: (_ctx, input: { id: string }) => system.markNotificationRead(input.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.BackupCreate,
    {
      permission: 'data.backup',
      handler: (ctx) => {
        const result = system.createBackup()
        services.auth.audit(
          ctx.session!.user.id,
          undefined,
          'backup.create',
          'backup',
          undefined,
          undefined,
          { file: result.file, sizeBytes: result.sizeBytes }
        )
        return result
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.BackupList,
    {
      permission: 'data.backup',
      handler: () => system.listBackups()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.BackupRestore,
    {
      permission: 'data.restore',
      schema: z.object({ file: z.string().min(1).max(256) }),
      handler: (ctx, input: { file: string }) => {
        system.restoreBackup(input.file)
        services.auth.audit(
          ctx.session!.user.id,
          undefined,
          'backup.restore',
          'backup',
          undefined,
          undefined,
          { file: input.file }
        )
        // Database has been replaced under the open handle — restart the app.
        app.relaunch()
        app.exit(0)
      }
    },
    services,
    () => sessionStore.get()
  )
}
