import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

export const createMainWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0B0E13',
    title: 'APEXPOS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Restrict new-window creation; external URLs open in the system browser only.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    if (is.dev && parsed.origin === process.env['ELECTRON_RENDERER_URL']) return
    if (parsed.protocol !== 'file:') event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export const setupAppSecurity = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    // Forbid remote module loading and navigation to arbitrary protocols
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.on('certificate-error', (event, _wc, _url, _err, _cert, callback) => {
    // Never accept invalid certs — deny by default.
    event.preventDefault()
    callback(false)
  })
}
