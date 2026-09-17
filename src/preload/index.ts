import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import type { PosApi } from '@shared/ipc/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (channel: string, ...args: unknown[]): Promise<any> =>
  ipcRenderer.invoke(channel, ...args)

const api: PosApi = {
  app: {
    info: () => invoke(IpcChannel.AppInfo),
    lock: () => invoke(IpcChannel.AppLock),
    unlock: (pin) => invoke(IpcChannel.AppUnlock, { pin })
  },
  auth: {
    login: (input) => invoke(IpcChannel.AuthLogin, input),
    loginPin: (input) => invoke(IpcChannel.AuthLoginPin, input),
    logout: () => invoke(IpcChannel.AuthLogout),
    session: () => invoke(IpcChannel.AuthSession),
    changePassword: (oldPassword, newPassword) =>
      invoke(IpcChannel.AuthChangePassword, { oldPassword, newPassword }),
    changePin: (pin) => invoke(IpcChannel.AuthChangePin, { pin }),
    listUsers: () => invoke(IpcChannel.AuthListUsers),
    hasPermission: (permission) => invoke(IpcChannel.AuthHasPermission, { permission }),
    requireOverride: (pin, permission) =>
      invoke(IpcChannel.AuthRequireOverride, { pin, permission })
  },
  users: {
    list: () => invoke(IpcChannel.UsersList),
    create: (input) => invoke(IpcChannel.UsersCreate, input),
    update: (input) => invoke(IpcChannel.UsersUpdate, input),
    setActive: (id, active) => invoke(IpcChannel.UsersSetActive, { id, active })
  },
  roles: {
    list: () => invoke(IpcChannel.RolesList),
    create: (input) => invoke(IpcChannel.RolesCreate, input),
    update: (input) => invoke(IpcChannel.RolesUpdate, input),
    delete: (id) => invoke(IpcChannel.RolesDelete, { id })
  },
  audit: {
    list: (query) => invoke(IpcChannel.AuditList, query)
  },
  categories: {
    list: () => invoke(IpcChannel.CategoriesList),
    create: (name, parentId) => invoke(IpcChannel.CategoriesCreate, { name, parentId }),
    update: (id, name) => invoke(IpcChannel.CategoriesUpdate, { id, name }),
    delete: (id) => invoke(IpcChannel.CategoriesDelete, { id })
  },
  products: {
    list: (query) => invoke(IpcChannel.ProductsList, query),
    get: (id) => invoke(IpcChannel.ProductsGet, { id }),
    create: (input) => invoke(IpcChannel.ProductsCreate, input),
    update: (input) => invoke(IpcChannel.ProductsUpdate, input),
    archive: (id) => invoke(IpcChannel.ProductsArchive, { id }),
    search: (term) => invoke(IpcChannel.ProductsSearch, { term }),
    byBarcode: (barcode) => invoke(IpcChannel.ProductsByBarcode, { barcode })
  },
  modifiers: {
    list: () => invoke(IpcChannel.ModifiersList),
    save: (input) => invoke(IpcChannel.ModifiersSave, input)
  },
  taxes: {
    list: () => invoke(IpcChannel.TaxesList)
  },
  discounts: {
    list: () => invoke(IpcChannel.DiscountsList)
  },
  orders: {
    create: (input) => invoke(IpcChannel.OrdersCreate, input),
    get: (id) => invoke(IpcChannel.OrdersGet, { id }),
    updateDraft: (input) => invoke(IpcChannel.OrdersUpdateDraft, input),
    hold: (id, holdName) => invoke(IpcChannel.OrdersHold, { id, holdName }),
    recall: (id) => invoke(IpcChannel.OrdersRecall, { id }),
    listHeld: () => invoke(IpcChannel.OrdersListHeld),
    cancelHeld: (id) => invoke(IpcChannel.OrdersCancelHeld, { id }),
    void: (id, reason) => invoke(IpcChannel.OrdersVoid, { id, reason }),
    receipt: (id) => invoke(IpcChannel.OrdersReceipt, { id })
  },
  payments: {
    tender: (input) => invoke(IpcChannel.PaymentsTender, input),
    refund: (input) => invoke(IpcChannel.PaymentsRefund, input),
    recent: (limit) => invoke(IpcChannel.PaymentsRecent, { limit })
  },
  register: {
    open: (input) => invoke(IpcChannel.RegisterOpen, input),
    close: (input) => invoke(IpcChannel.RegisterClose, input),
    current: () => invoke(IpcChannel.RegisterCurrent),
    cashMovement: (input) => invoke(IpcChannel.RegisterCashMovement, input),
    xReport: () => invoke(IpcChannel.RegisterXReport),
    zReport: () => invoke(IpcChannel.RegisterZReport)
  },
  inventory: {
    onHand: (productId) => invoke(IpcChannel.InventoryOnHand, { productId }),
    movements: (productId, limit) => invoke(IpcChannel.InventoryMovements, { productId, limit }),
    adjust: (input) => invoke(IpcChannel.InventoryAdjust, input),
    lowStock: () => invoke(IpcChannel.InventoryLowStock)
  },
  suppliers: {
    list: () => invoke(IpcChannel.SuppliersList),
    save: (input) => invoke(IpcChannel.SuppliersSave, input)
  },
  purchaseOrders: {
    list: (status) => invoke(IpcChannel.PurchaseOrdersList, { status }),
    get: (id) => invoke(IpcChannel.PurchaseOrdersGet, { id }),
    create: (input) => invoke(IpcChannel.PurchaseOrdersCreate, input),
    send: (id) => invoke(IpcChannel.PurchaseOrdersSend, { id }),
    receivePartial: (id, received) => invoke(IpcChannel.PurchaseOrdersReceive, { id, received }),
    cancel: (id) => invoke(IpcChannel.PurchaseOrdersCancel, { id })
  },
  customers: {
    list: (search) => invoke(IpcChannel.CustomersList, { search }),
    save: (input) => invoke(IpcChannel.CustomersSave, input),
    adjustLoyalty: (id, delta, reason) =>
      invoke(IpcChannel.CustomersAdjustLoyalty, { id, delta, reason })
  },
  giftCards: {
    list: () => invoke(IpcChannel.GiftCardsList),
    issue: (code, amount) => invoke(IpcChannel.GiftCardsIssue, { code, amount }),
    balance: (code) => invoke(IpcChannel.GiftCardsBalance, { code })
  },
  floors: {
    zones: () => invoke(IpcChannel.FloorsGet),
    tables: (zoneId) => invoke(IpcChannel.FloorsSave, { zoneId }),
    saveZone: (input) => invoke(IpcChannel.FloorsSave, input),
    saveTable: (input) => invoke(IpcChannel.FloorsSave, input)
  },
  tables: {
    open: (input) => invoke(IpcChannel.TablesOpen, input),
    close: (tableId) => invoke(IpcChannel.TablesClose, { tableId })
  },
  settings: {
    get: (key) => invoke(IpcChannel.SettingsGet, { key }),
    set: (key, value) => invoke(IpcChannel.SettingsSet, { key, value }),
    all: () => invoke(IpcChannel.SettingsAll),
    setTheme: (theme) => invoke(IpcChannel.SettingsSet, { key: 'app.theme', value: theme })
  },
  notifications: {
    list: (unreadOnly) => invoke(IpcChannel.NotificationsList, { unreadOnly }),
    markRead: (id) => invoke(IpcChannel.NotificationsMarkRead, { id })
  },
  hardware: {
    testPrinter: () => invoke(IpcChannel.HardwareTest, { device: 'printer' }),
    openDrawer: () => invoke(IpcChannel.HardwareOpenDrawer),
    virtualScan: (barcode) => ipcRenderer.send(IpcChannel.HardwareScannerVirtual, { barcode }),
    isPrinterAvailable: () => invoke(IpcChannel.HardwareTest, { device: 'printer-status' }),
    openCustomerDisplay: () => invoke(IpcChannel.HardwareCustomerDisplay, { open: true })
  },
  display: {
    push: (cart) => ipcRenderer.send('customer:update', cart)
  },
  events: {
    on: (channel, cb) => {
      const listener = (_: unknown, payload: unknown): void => cb(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
