import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

let display: BrowserWindow | null = null

/** Customer-facing display on a second monitor (or floating window in demo). */
export const openCustomerDisplay = (): BrowserWindow => {
  if (display && !display.isDestroyed()) {
    display.focus()
    return display
  }
  display = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'APEXPOS Customer Display',
    autoHideMenuBar: true,
    backgroundColor: '#0B0E13',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const params = '?display=customer'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void display.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${params}`)
  } else {
    void display.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { display: 'customer' }
    })
  }
  display.on('closed', () => (display = null))
  return display
}

/** Push current cart state to the customer display via IPC event. */
export const pushToCustomerDisplay = (payload: unknown): void => {
  if (display && !display.isDestroyed()) {
    display.webContents.send('customer:update', payload)
  }
}
