import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { AppInfo } from '@shared/ipc/api'
import { app } from 'electron'

export const registerAppIpc = (services: Services, sessionStore: SessionStore): void => {
  handle<[], AppInfo>(IpcChannel.AppInfo, {
    handler: () => ({
      version: app.getVersion(),
      dataDir: services.dataDir as string,
      isPackaged: app.isPackaged,
      platform: process.platform,
      onboardingComplete: true,
      hasAnyUser: true
    })
  }, services, () => sessionStore.get())

  handle(IpcChannel.AppLock, {
    handler: () => sessionStore.lock()
  }, services, () => sessionStore.get())
}
