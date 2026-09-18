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

  handle(IpcChannel.SettingsGet, {
    handler: (_ctx, input: { key: string }) => settings.get(input.key as never)
  }, services, () => sessionStore.get())

  handle(IpcChannel.SettingsSet, {
    permission: 'settings.manage',
    handler: (_ctx, input: { key: string; value: unknown }) =>
      settings.set(input.key as never, input.value as never)
  }, services, () => sessionStore.get())

  handle(IpcChannel.SettingsAll, {
    handler: () => settings.all()
  }, services, () => sessionStore.get())

  handle(IpcChannel.NotificationsList, {
    handler: (_ctx, input?: { unreadOnly?: boolean }) => system.notifications(input?.unreadOnly)
  }, services, () => sessionStore.get())

  handle(IpcChannel.NotificationsMarkRead, {
    handler: (_ctx, input: { id: string }) => system.markNotificationRead(input.id)
  }, services, () => sessionStore.get())

  handle(IpcChannel.BackupCreate, {
    permission: 'settings.manage',
    handler: () => system.createBackup()
  }, services, () => sessionStore.get())

  handle(IpcChannel.BackupList, {
    handler: () => system.listBackups()
  }, services, () => sessionStore.get())

  handle(IpcChannel.BackupRestore, {
    permission: 'settings.manage',
    schema: z.object({ file: z.string().min(1) }),
    handler: (_ctx, input: { file: string }) => {
      system.restoreBackup(input.file)
      // Database has been replaced under the open handle — restart the app.
      app.relaunch()
      app.exit(0)
    }
  }, services, () => sessionStore.get())
}
