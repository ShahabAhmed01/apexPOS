/**
 * Central registry of every IPC channel. Domain-oriented naming:
 * `<domain>:<action>`. The preload allowlist is derived from this list, so any
 * channel NOT present here is unreachable from the renderer.
 */
export const IpcChannel = {
  // Application / shell
  AppInfo: 'app:info',
  AppLock: 'app:lock',
  AppUnlock: 'app:unlock',
  AppRestart: 'app:restart',
  AppAutoLockConfig: 'app:autoLockConfig',

  // Auth & sessions
  AuthLogin: 'auth:login',
  AuthLoginPin: 'auth:loginPin',
  AuthLogout: 'auth:logout',
  AuthSession: 'auth:session',
  AuthChangePassword: 'auth:changePassword',
  AuthChangePin: 'auth:changePin',
  AuthListUsers: 'auth:listUsers',
  AuthListSessions: 'auth:listSessions',
  AuthRevokeSession: 'auth:revokeSession',
  AuthHasPermission: 'auth:hasPermission',
  AuthRequireOverride: 'auth:requireOverride',

  // Users / roles / permissions
  UsersList: 'users:list',
  UsersGet: 'users:get',
  UsersCreate: 'users:create',
  UsersUpdate: 'users:update',
  UsersSetActive: 'users:setActive',
  RolesList: 'roles:list',
  RolesCreate: 'roles:create',
  RolesUpdate: 'roles:update',
  RolesDelete: 'roles:delete',
  RolesPermissionCatalog: 'roles:permissionCatalog',

  // Audit
  AuditList: 'audit:list',

  // Onboarding
  OnboardingState: 'onboarding:state',
  OnboardingCompleteStep: 'onboarding:completeStep',
  OnboardingFinish: 'onboarding:finish',

  // Catalog
  CategoriesList: 'categories:list',
  CategoriesCreate: 'categories:create',
  CategoriesUpdate: 'categories:update',
  CategoriesDelete: 'categories:delete',
  ProductsList: 'products:list',
  ProductsGet: 'products:get',
  ProductsCreate: 'products:create',
  ProductsUpdate: 'products:update',
  ProductsArchive: 'products:archive',
  ProductsSearch: 'products:search',
  ProductsByBarcode: 'products:byBarcode',
  ModifiersList: 'modifiers:list',
  ModifiersSave: 'modifiers:save',
  UnitsList: 'units:list',
  BrandsList: 'brands:list',

  // Taxes & discounts
  TaxesList: 'taxes:list',
  TaxesSave: 'taxes:save',
  DiscountsList: 'discounts:list',
  DiscountsSave: 'discounts:save',
  PromotionsList: 'promotions:list',
  PromotionsSave: 'promotions:save',

  // POS / orders
  OrdersCreate: 'orders:create',
  OrdersGet: 'orders:get',
  OrdersList: 'orders:list',
  OrdersUpdateDraft: 'orders:updateDraft',
  OrdersHold: 'orders:hold',
  OrdersRecall: 'orders:recall',
  OrdersListHeld: 'orders:listHeld',
  OrdersCancelHeld: 'orders:cancelHeld',
  OrdersVoid: 'orders:void',
  OrdersFireCourse: 'orders:fireCourse',
  OrdersItemStatus: 'orders:itemStatus',
  OrdersTransfer: 'orders:transferTable',
  OrdersMerge: 'orders:mergeTables',
  OrdersReceipt: 'orders:receipt',

  // Payments
  PaymentsTender: 'payments:tender',
  PaymentsRefund: 'payments:refund',
  PaymentsRecent: 'payments:recent',
  PaymentsSimulatedCardOutcome: 'payments:setSimulatedCardOutcome',

  // Register / shifts
  RegisterOpen: 'register:open',
  RegisterClose: 'register:close',
  RegisterCurrent: 'register:current',
  RegisterCashMovement: 'register:cashMovement',
  RegisterNoSale: 'register:noSale',
  RegisterXReport: 'register:xReport',
  RegisterZReport: 'register:zReport',
  RegisterListShifts: 'register:listShifts',

  // Inventory
  InventoryOnHand: 'inventory:onHand',
  InventoryMovements: 'inventory:movements',
  InventoryAdjust: 'inventory:adjust',
  InventoryWastage: 'inventory:wastage',
  InventoryTransfersList: 'inventory:transfers:list',
  InventoryTransferCreate: 'inventory:transfers:create',
  InventoryTransferReceive: 'inventory:transfers:receive',
  InventoryCountsList: 'inventory:counts:list',
  InventoryCountCreate: 'inventory:counts:create',
  InventoryCountComplete: 'inventory:counts:complete',
  InventoryLowStock: 'inventory:lowStock',

  // Purchasing
  SuppliersList: 'suppliers:list',
  SuppliersSave: 'suppliers:save',
  PurchaseOrdersList: 'purchaseOrders:list',
  PurchaseOrdersGet: 'purchaseOrders:get',
  PurchaseOrdersCreate: 'purchaseOrders:create',
  PurchaseOrdersSend: 'purchaseOrders:send',
  PurchaseOrdersReceive: 'purchaseOrders:receive',
  PurchaseOrdersCancel: 'purchaseOrders:cancel',

  // Restaurant
  FloorsGet: 'floors:get',
  FloorsSave: 'floors:save',
  TablesOpen: 'tables:open',
  TablesClose: 'tables:close',
  TablesActive: 'tables:active',
  TablesTransfer: 'tables:transfer',
  TablesRequestBill: 'tables:requestBill',
  TablesMoveLines: 'tables:moveLines',
  TablesMerge: 'tables:merge',
  KitchenBoard: 'kitchen:board',
  KitchenBump: 'kitchen:bump',
  KitchenRecall: 'kitchen:recall',

  // Customers / CRM
  CustomersList: 'customers:list',
  CustomersGet: 'customers:get',
  CustomersSave: 'customers:save',
  CustomersLoyalty: 'customers:loyalty',
  CustomersAdjustLoyalty: 'customers:adjustLoyalty',
  GiftCardsList: 'giftCards:list',
  GiftCardsIssue: 'giftCards:issue',
  GiftCardsRedeem: 'giftCards:redeem',
  GiftCardsBalance: 'giftCards:balance',
  StoreCreditAdjust: 'storeCredit:adjust',
  StoreCreditHistory: 'storeCredit:history',

  // Reports
  ReportsDashboard: 'reports:dashboard',
  ReportsSales: 'reports:sales',
  ReportsFinancial: 'reports:financial',
  ReportsInventory: 'reports:inventory',
  ReportsStaff: 'reports:staff',
  ReportsCustomers: 'reports:customers',
  ReportsPurchasing: 'reports:purchasing',
  ReportsExportCsv: 'reports:exportCsv',
  ReportsExportPdf: 'reports:exportPdf',

  // Notifications
  NotificationsList: 'notifications:list',
  NotificationsMarkRead: 'notifications:markRead',

  // Settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsAll: 'settings:all',

  // Hardware
  HardwareList: 'hardware:list',
  HardwareConfigure: 'hardware:configure',
  HardwareTest: 'hardware:test',
  HardwarePrintReceipt: 'hardware:printReceipt',
  HardwareOpenDrawer: 'hardware:openDrawer',
  HardwareScannerVirtual: 'hardware:virtualScan',
  HardwareCustomerDisplay: 'hardware:customerDisplay',
  HardwareScaleRead: 'hardware:scaleRead',
  HardwareSubscribeEvents: 'hardware:subscribeEvents',
  HardwareEvent: 'hardware:event',

  // Data / backup / import
  BackupCreate: 'backup:create',
  BackupList: 'backup:list',
  BackupRestore: 'backup:restore',
  ExportData: 'data:export',
  ImportPreview: 'import:preview',
  ImportCommit: 'import:commit',

  // Sync
  SyncStatus: 'sync:status',
  SyncPush: 'sync:push',
  SyncSetOnline: 'sync:setOnline'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** The preload allowlist is the full set of registered channel values. */
export const ALL_CHANNELS: readonly string[] = Object.values(IpcChannel)
