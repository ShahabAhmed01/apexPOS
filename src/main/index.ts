import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createMainWindow, setupAppSecurity } from './windows/mainWindow'
import { openDatabase } from './db/database'
import { seedIfEmpty } from './db/seed'
import { AuthService } from './services/authService'
import { registerAppIpc } from './ipc/registerApp'
import { registerAuthIpc } from './ipc/registerAuth'
import { SessionStore } from './services/sessionStore'
import type { Services } from './ipc/registry'

const dataDir = process.env.APEXPOS_DATA_DIR ?? join(app.getPath('userData'), 'apexpos-data')
const dbPath = join(dataDir, 'apexpos.db')

const ctx = openDatabase(dbPath)
seedIfEmpty(ctx.db)

const sessionStore = new SessionStore()
const services: Services = {
  db: ctx.db,
  dataDir,
  auth: new AuthService(ctx.db)
}

registerAppIpc(services, sessionStore)
registerAuthIpc(services, sessionStore)

app.whenReady().then(() => {
  setupAppSecurity()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ctx.close()
})
