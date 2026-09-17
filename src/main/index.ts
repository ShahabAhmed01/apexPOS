import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { createMainWindow, setupAppSecurity } from './windows/mainWindow'
import { pushToCustomerDisplay } from './windows/customerDisplay'
import { openDatabase } from './db/database'
import { seedIfEmpty } from './db/seed'
import { AuthService } from './services/authService'
import { OrderService } from './services/orderService'
import { PaymentService } from './services/paymentService'
import { RegisterService } from './services/registerService'
import { ProductService } from './services/productService'
import { registerAppIpc } from './ipc/registerApp'
import { registerAuthIpc } from './ipc/registerAuth'
import { registerOrderIpc } from './ipc/registerOrders'
import { registerCatalogIpc } from './ipc/registerCatalog'
import { registerHardwareIpc } from './ipc/registerHardware'
import { registerRestaurantIpc } from './ipc/registerRestaurant'
import { RestaurantService } from './services/restaurantService'
import { ReportService } from './services/reportService'
import { registerReportsIpc } from './ipc/registerReports'
import { HardwareService } from './hardware/hardwareService'
import { SessionStore } from './services/sessionStore'
import type { Services } from './ipc/registry'

const dataDir = process.env.APEXPOS_DATA_DIR ?? join(app.getPath('userData'), 'apexpos-data')
const dbPath = join(dataDir, 'apexpos.db')

const ctx = openDatabase(dbPath)
seedIfEmpty(ctx.db)

const firstBranch = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id

const sessionStore = new SessionStore()
const auth = new AuthService(ctx.db)
const orders = new OrderService(ctx.db, auth, firstBranch)
const payments = new PaymentService(
  ctx.db,
  auth,
  firstBranch,
  (orderId, userId) => orders.completePayment(orderId, userId),
  (orderId) => orders.getOrder(orderId)
)
const services: Services = {
  db: ctx.db,
  dataDir,
  auth,
  orders,
  payments,
  registers: new RegisterService(ctx.db, auth, firstBranch),
  products: new ProductService(ctx.db, firstBranch),
  hardware: new HardwareService(),
  restaurant: new RestaurantService(ctx.db, firstBranch),
  reports: new ReportService(ctx.db, firstBranch)
}

registerAppIpc(services, sessionStore)
registerAuthIpc(services, sessionStore)
registerOrderIpc(services, sessionStore)
registerCatalogIpc(services, sessionStore)
registerHardwareIpc(services, sessionStore)
registerRestaurantIpc(services, sessionStore)
registerReportsIpc(services, sessionStore)

app.whenReady().then(() => {
  setupAppSecurity()
  createMainWindow()

  // Forward cart state to the customer display window
  ipcMain.on('customer:update', (_e, payload) => pushToCustomerDisplay(payload))

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
