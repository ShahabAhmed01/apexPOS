import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { AppInfo } from '@shared/ipc/api'
import type { OnboardingService } from '../services/onboardingService'
import type { DB } from '../db/database'
import { app } from 'electron'

export const registerAppIpc = (services: Services, sessionStore: SessionStore): void => {
  const db = services.db as DB
  const onboarding = services.onboarding as OnboardingService

  handle<[], AppInfo>(
    IpcChannel.AppInfo,
    {
      handler: () => ({
        version: app.getVersion(),
        dataDir: services.dataDir as string,
        isPackaged: app.isPackaged,
        platform: process.platform,
        onboardingComplete: onboarding.isComplete(),
        hasAnyUser:
          (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c > 0
      })
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AppLock,
    {
      handler: () => sessionStore.lock()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.AppRestart,
    {
      // Public: used right after onboarding finishes (no session exists yet)
      // and after backup restores. Restarting the app is not a privileged act.
      handler: () => {
        app.relaunch()
        app.exit(0)
      }
    },
    services,
    () => sessionStore.get()
  )
}
