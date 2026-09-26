import type { IpcResult } from './envelope'
import type {
  AppNotification,
  AuditEntry,
  Category,
  Customer,
  GiftCard,
  ModifierGroup,
  Order,
  Paginated,
  Payment,
  Product,
  PurchaseOrder,
  RestaurantTable,
  Role,
  SessionInfo,
  Shift,
  StockMovement,
  Supplier,
  TaxRate,
  Discount,
  User,
  Zone
} from '../types/models'
import type { ThemePreference } from '../settings/registry'
import type { SettingKey, SettingValue } from '../settings/registry'

// ---------------------------------------------------------------------------
// Payload shapes used across the wire
// ---------------------------------------------------------------------------

export interface AppInfo {
  version: string
  dataDir: string
  isPackaged: boolean
  platform: string
  onboardingComplete: boolean
  hasAnyUser: boolean
  /** True only when the app was started with APEXPOS_AXE=1 (test harness). */
  axeTestHooks?: boolean
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingStateData {
  businessName?: string
  legalName?: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  country?: string
  language?: string
  currencyCode?: string
  symbolPosition?: 'before' | 'after'
  timezone?: string
  taxName?: string
  taxRateBps?: number
  taxInclusive?: boolean
  mode?: 'retail' | 'restaurant' | 'hybrid'
  adminUsername?: string
  adminDisplayName?: string
  adminCreated?: boolean
  theme?: 'dark' | 'light' | 'system'
  registerName?: string
  registerCode?: string
  openingFloat?: number
  printerProfile?: 'none' | 'simulator'
  cashDrawerProfile?: 'none' | 'simulator'
  demoData?: boolean
}

export interface OnboardingState {
  status: 'pending' | 'in_progress' | 'complete'
  stepIndex: number
  data: OnboardingStateData
  completedAt?: string
  demo?: boolean
}

export interface OnboardingFinishInput {
  businessName: string
  legalName?: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  country: string
  language: string
  currencyCode: string
  symbolPosition: 'before' | 'after'
  timezone: string
  taxName: string
  taxRateBps: number
  taxInclusive: boolean
  mode: 'retail' | 'restaurant' | 'hybrid'
  adminUsername: string
  adminDisplayName: string
  adminPassword: string
  adminPin: string
  theme: 'dark' | 'light' | 'system'
  registerName: string
  registerCode: string
  openingFloat: number
  printerProfile: 'none' | 'simulator'
  cashDrawerProfile: 'none' | 'simulator'
  demoData: boolean
}

export interface LoginInput {
  username: string
  password: string
}

export interface PinLoginInput {
  userId: string
  pin: string
}

export interface ProductListQuery {
  search?: string
  categoryId?: string
  includeInactive?: boolean
  limit?: number
  offset?: number
}

export interface ProductUpsertInput {
  id?: string
  sku: string
  barcode?: string
  name: string
  description?: string
  categoryId?: string
  brandId?: string
  unitId: string
  price: number
  cost: number
  taxId?: string
  trackStock: boolean
  lowStockThreshold?: number
  isWeighted: boolean
  tags: string[]
  variants: {
    id?: string
    sku: string
    barcode?: string
    name: string
    attributes: Record<string, string>
    price: number
    cost: number
  }[]
  modifierGroupIds: string[]
}

export interface CartLineInput {
  productId: string
  variantId?: string
  quantityMilli: number
  unitPriceOverride?: number
  lineDiscountMinor?: number
  course?: string
  seat?: number
  notes?: string
  modifierOptionIds?: string[]
}

export interface CreateOrderInput {
  type: 'retail' | 'dine_in' | 'takeaway'
  registerId?: string
  customerId?: string
  tableId?: string
  lines: CartLineInput[]
  cartDiscount?: { kind: 'percent' | 'amount'; value: number }
  tip?: number
  holdName?: string
  /** Client-generated idempotency key; duplicates return the same order. */
  clientOpId: string
}

export interface TenderInput {
  orderId: string
  payments: {
    method: Payment['method']
    amount: number
    tendered?: number
    reference?: string
    giftCardCode?: string
    /** For simulated card flows: force outcome for demo/training. */
    simulateOutcome?: 'approved' | 'declined'
  }[]
  serviceCharge?: number
  tip?: number
  clientOpId: string
}

export interface RefundInput {
  orderId: string
  lines: { orderLineId: string; qtyMilli: number }[]
  reason: string
  refundMethod: 'original' | 'cash' | 'store_credit'
  /** Verified manager/overrider PIN; the matching user becomes the approver. */
  managerPin: string
  clientOpId: string
}

export interface CashMovementInput {
  kind: 'pay_in' | 'pay_out'
  amount: number
  reason: string
}

export interface OpenRegisterInput {
  registerId: string
  openingFloat: number
}

export interface CloseRegisterInput {
  countedCash: number
  note?: string
  blind?: boolean
}

export interface StockAdjustInput {
  productId: string
  variantId?: string
  qtyDeltaMilli: number
  reason: 'adjustment' | 'waste'
  note: string
  managerPin?: string
}

export interface CustomerInput {
  id?: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  tags?: string[]
}

export interface SupplierInput {
  id?: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
}

export interface PurchaseOrderInput {
  supplierId: string
  expectedAt?: string
  notes?: string
  items: { productId: string; variantId?: string; qtyMilli: number; unitCost: number }[]
}

export interface UserInput {
  id?: string
  username: string
  displayName: string
  roleId: string
  branchId?: string
  password?: string
  pin?: string
}

export interface RoleInput {
  id?: string
  name: string
  description?: string
  permissions: string[]
}

export interface AuditQuery {
  search?: string
  action?: string
  entity?: string
  userId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface ReportRangeInput {
  from: string
  to: string
  branchId?: string
}

export interface TableOpenInput {
  tableId: string
  guests: number
  serverId?: string
}

export interface FloorTableInput {
  id?: string
  zoneId: string
  name: string
  capacity: number
  shape: 'square' | 'round' | 'rect'
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface ZoneInput {
  id?: string
  name: string
  sortOrder: number
}

export interface ModifierGroupInput {
  id?: string
  name: string
  minSelect: number
  maxSelect: number
  required: boolean
  options: { id?: string; name: string; priceDelta: number; isDefault: boolean }[]
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface DashboardData {
  salesToday: number
  ordersToday: number
  refundsToday: number
  averageBasket: number
  paymentsByMethod: { method: string; count: number; amount: number }[]
  salesByHour: { hour: string; sales: number; orders: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
}

export interface SalesReport {
  summary: { date: string; orders: number; revenue: number; discounts: number; tax: number }[]
  categories: { name: string; revenue: number }[]
  hours: { hour: number; sales: number }[]
}

export interface FinancialReport {
  gross: number
  discounts: number
  tax: number
  net: number
}

export interface BackupFile {
  file: string
  createdAt: string
  sizeBytes: number
}

// ---------------------------------------------------------------------------
// The preload API — window.api
// ---------------------------------------------------------------------------
export interface PosApi {
  app: {
    info: () => Promise<IpcResult<AppInfo>>
    lock: () => Promise<IpcResult<void>>
    restart: () => Promise<IpcResult<void>>
  }
  onboarding: {
    state: () => Promise<IpcResult<OnboardingState>>
    saveStep: (
      stepId: string,
      stepIndex: number,
      data: Record<string, unknown>
    ) => Promise<IpcResult<OnboardingState>>
    finish: (input: OnboardingFinishInput) => Promise<IpcResult<{ restartRequired: boolean }>>
  }
  auth: {
    login: (input: LoginInput) => Promise<IpcResult<SessionInfo>>
    loginPin: (input: PinLoginInput) => Promise<IpcResult<SessionInfo>>
    logout: () => Promise<IpcResult<void>>
    session: () => Promise<IpcResult<SessionInfo | null>>
    changePassword: (oldPw: string, newPw: string) => Promise<IpcResult<void>>
    changePin: (pin: string) => Promise<IpcResult<void>>
    listUsers: () => Promise<IpcResult<User[]>>
    hasPermission: (key: string) => Promise<IpcResult<boolean>>
    requireOverride: (pin: string, permission: string) => Promise<IpcResult<string>>
  }
  users: {
    list: () => Promise<IpcResult<User[]>>
  }
  roles: {
    list: () => Promise<IpcResult<Role[]>>
  }
  audit: {
    list: (query: AuditQuery) => Promise<IpcResult<Paginated<AuditEntry>>>
  }
  categories: {
    list: () => Promise<IpcResult<Category[]>>
  }
  products: {
    list: (query: ProductListQuery) => Promise<IpcResult<Paginated<Product>>>
    get: (id: string) => Promise<IpcResult<Product>>
    search: (term: string) => Promise<IpcResult<Product[]>>
    byBarcode: (barcode: string) => Promise<IpcResult<Product | null>>
  }
  modifiers: {
    list: () => Promise<IpcResult<ModifierGroup[]>>
  }
  taxes: {
    list: () => Promise<IpcResult<TaxRate[]>>
  }
  discounts: {
    list: () => Promise<IpcResult<Discount[]>>
  }
  orders: {
    create: (input: CreateOrderInput) => Promise<IpcResult<Order>>
    get: (id: string) => Promise<IpcResult<Order>>
    updateDraft: (input: CreateOrderInput & { orderId: string }) => Promise<IpcResult<Order>>
    hold: (id: string, holdName?: string) => Promise<IpcResult<Order>>
    recall: (id: string) => Promise<IpcResult<Order>>
    listHeld: () => Promise<IpcResult<Order[]>>
    cancelHeld: (id: string) => Promise<IpcResult<void>>
    void: (id: string, reason: string) => Promise<IpcResult<void>>
    receipt: (id: string) => Promise<IpcResult<string>>
  }
  payments: {
    tender: (input: TenderInput) => Promise<IpcResult<Order>>
    refund: (input: RefundInput) => Promise<IpcResult<void>>
    recent: (limit?: number) => Promise<IpcResult<Payment[]>>
  }
  register: {
    open: (input: OpenRegisterInput) => Promise<IpcResult<Shift>>
    close: (input: CloseRegisterInput) => Promise<IpcResult<Shift>>
    current: () => Promise<IpcResult<Shift | null>>
    cashMovement: (input: CashMovementInput) => Promise<IpcResult<void>>
    xReport: () => Promise<IpcResult<Record<string, unknown>>>
    zReport: () => Promise<IpcResult<Record<string, unknown>>>
  }
  inventory: {
    onHand: (productId: string) => Promise<IpcResult<number>>
    movements: (productId?: string, limit?: number) => Promise<IpcResult<StockMovement[]>>
    adjust: (input: StockAdjustInput) => Promise<IpcResult<void>>
    lowStock: () => Promise<IpcResult<Product[]>>
  }
  suppliers: {
    list: (search?: string) => Promise<IpcResult<Supplier[]>>
    save: (input: SupplierInput) => Promise<IpcResult<Supplier>>
  }
  purchaseOrders: {
    list: (status?: string) => Promise<IpcResult<PurchaseOrder[]>>
    get: (id: string) => Promise<IpcResult<PurchaseOrder>>
    create: (input: PurchaseOrderInput) => Promise<IpcResult<PurchaseOrder>>
    send: (id: string) => Promise<IpcResult<void>>
    receivePartial: (
      id: string,
      received: { itemId: string; qtyMilli: number }[],
      clientOpId?: string
    ) => Promise<IpcResult<void>>
    cancel: (id: string) => Promise<IpcResult<void>>
  }
  customers: {
    list: (search?: string) => Promise<IpcResult<Customer[]>>
    save: (input: CustomerInput) => Promise<IpcResult<Customer>>
    adjustLoyalty: (id: string, delta: number, reason: string) => Promise<IpcResult<void>>
  }
  giftCards: {
    list: () => Promise<IpcResult<GiftCard[]>>
    issue: (code: string, amount: number) => Promise<IpcResult<GiftCard>>
    balance: (code: string) => Promise<IpcResult<number>>
  }
  floors: {
    zones: () => Promise<IpcResult<Zone[]>>
    tables: (zoneId?: string) => Promise<IpcResult<RestaurantTable[]>>
    saveTable: (input: FloorTableInput) => Promise<IpcResult<RestaurantTable>>
  }
  tables: {
    open: (input: TableOpenInput) => Promise<IpcResult<string>>
    close: (tableId: string) => Promise<IpcResult<void>>
    transfer: (orderId: string, targetTableId: string) => Promise<IpcResult<void>>
    requestBill: (orderId: string) => Promise<IpcResult<void>>
    moveLines: (
      orderId: string,
      lineIds: string[],
      targetTableId: string
    ) => Promise<IpcResult<string>>
    merge: (orderId: string, targetTableId: string) => Promise<IpcResult<string>>
  }
  kitchen: {
    board: () => Promise<IpcResult<unknown[]>>
    bump: (orderId: string) => Promise<IpcResult<void>>
  }
  settings: {
    get: <K extends SettingKey>(key: K) => Promise<IpcResult<SettingValue<K>>>
    set: <K extends SettingKey>(key: K, value: SettingValue<K>) => Promise<IpcResult<void>>
    all: () => Promise<IpcResult<Record<string, unknown>>>
    setTheme: (theme: ThemePreference) => Promise<IpcResult<void>>
  }
  notifications: {
    list: (unreadOnly?: boolean) => Promise<IpcResult<AppNotification[]>>
    markRead: (id: string) => Promise<IpcResult<void>>
  }
  reports: {
    dashboard: () => Promise<IpcResult<DashboardData>>
    sales: (range: { from?: string; to?: string }) => Promise<IpcResult<SalesReport>>
    financial: (range: { from?: string; to?: string }) => Promise<IpcResult<FinancialReport>>
  }
  hardware: {
    testPrinter: () => Promise<IpcResult<string>>
    openDrawer: () => Promise<IpcResult<void>>
    printReceipt: (orderId: string) => Promise<IpcResult<{ ok: true; preview: string }>>
    isPrinterAvailable: () => Promise<IpcResult<boolean>>
    openCustomerDisplay: () => Promise<IpcResult<{ open: boolean }>>
  }
  display: {
    /** Push cart state to the customer display window (fire-and-forget). */
    push: (cart: unknown) => void
  }
  backup: {
    list: () => Promise<IpcResult<BackupFile[]>>
    create: () => Promise<IpcResult<BackupFile>>
    restore: (file: string) => Promise<IpcResult<void>>
  }
  events: {
    /** Subscribe to main-process events. Returns unsubscribe. */
    on: (channel: string, cb: (payload: unknown) => void) => () => void
  }
}
