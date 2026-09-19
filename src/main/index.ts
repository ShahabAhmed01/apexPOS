import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '@shared/ipc/channels'
import { handle } from './ipc/registry'
import { createMainWindow, setupAppSecurity } from './windows/mainWindow'
import { pushToCustomerDisplay } from './windows/customerDisplay'
import { openDatabase } from './db/database'
import { seedBase, seedIfEmpty } from './db/seed'
import { OnboardingService } from './services/onboardingService'
import { registerOnboardingIpc } from './ipc/registerOnboarding'
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
import { CustomerService } from './services/customerService'
import { registerCustomersIpc } from './ipc/registerCustomers'
import { SettingsService } from './services/settingsService'
import { SystemService } from './services/systemService'
import { registerSettingsIpc } from './ipc/registerSettings'
import { HardwareService } from './hardware/hardwareService'
import { SessionStore } from './services/sessionStore'
import { PurchaseService } from './services/purchaseService'
import { registerPurchasingIpc } from './ipc/registerPurchasing'
import { SyncService } from './services/syncService'
import type { Services } from './ipc/registry'

const dataDir = process.env.APEXPOS_DATA_DIR ?? join(app.getPath('userData'), 'apexpos-data')
const dbPath = join(dataDir, 'apexpos.db')

const ctx = openDatabase(dbPath)

// First boot:
//   APEXPOS_SEED_DEMO=1  → full demo store (development, E2E, packaged demo)
//   otherwise            → base seed only (roles/units) and the onboarding
//                          wizard runs before the app can be used.
const freshInstall = (ctx.db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }).c === 0
if (freshInstall && process.env.APEXPOS_SEED_DEMO === '1') {
  seedIfEmpty(ctx.db)
} else if (freshInstall) {
  seedBase(ctx.db)
}

const firstBranchRow = ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as
  | { id: string }
  | undefined
// No branch yet => onboarding is pending; services that need a branch are
// unreachable until a session exists, which is impossible before onboarding.
const firstBranch = firstBranchRow?.id ?? ''

const sessionStore = new SessionStore()
const auth = new AuthService(ctx.db)
const sync = new SyncService(ctx.db)
const orders = new OrderService(ctx.db, auth, firstBranch, sync)
const payments = new PaymentService(
  ctx.db,
  auth,
  firstBranch,
  (orderId, userId) => orders.completePayment(orderId, userId),
  (orderId) => orders.getOrder(orderId),
  sync
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
  reports: new ReportService(ctx.db, firstBranch),
  customers: new CustomerService(ctx.db),
  settings: new SettingsService(ctx.db),
  system: new SystemService(ctx.db, dataDir),
  onboarding: new OnboardingService(ctx.db),
  purchasing: new PurchaseService(ctx.db, auth, firstBranch, undefined, sync),
  sync
}

registerAppIpc(services, sessionStore)
registerOnboardingIpc(services, sessionStore)
registerAuthIpc(services, sessionStore)
registerOrderIpc(services, sessionStore)
registerCatalogIpc(services, sessionStore)
registerHardwareIpc(services, sessionStore)
registerRestaurantIpc(services, sessionStore)
registerReportsIpc(services, sessionStore)
registerCustomersIpc(services, sessionStore)
registerSettingsIpc(services, sessionStore)
registerPurchasingIpc(services, sessionStore)

// Sync status — local outbox truth only (no remote transport exists).
handle(
  IpcChannel.SyncStatus,
  { requiresAuth: true, handler: () => sync.status() },
  services,
  () => sessionStore.get()
)

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
