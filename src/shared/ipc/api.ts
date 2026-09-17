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
  managerUserId: string
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
// The preload API — window.api
// ---------------------------------------------------------------------------

export interface PosApi {
  app: {
    info: () => Promise<IpcResult<AppInfo>>
    lock: () => Promise<IpcResult<void>>
    unlock: (pin: string) => Promise<IpcResult<void>>
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
    create: (input: UserInput) => Promise<IpcResult<User>>
    update: (input: UserInput) => Promise<IpcResult<User>>
    setActive: (id: string, active: boolean) => Promise<IpcResult<void>>
  }
  roles: {
    list: () => Promise<IpcResult<Role[]>>
    create: (input: RoleInput) => Promise<IpcResult<Role>>
    update: (input: RoleInput) => Promise<IpcResult<Role>>
    delete: (id: string) => Promise<IpcResult<void>>
  }
  audit: {
    list: (query: AuditQuery) => Promise<IpcResult<Paginated<AuditEntry>>>
  }
  categories: {
    list: () => Promise<IpcResult<Category[]>>
    create: (name: string, parentId?: string) => Promise<IpcResult<Category>>
    update: (id: string, name: string) => Promise<IpcResult<Category>>
    delete: (id: string) => Promise<IpcResult<void>>
  }
  products: {
    list: (query: ProductListQuery) => Promise<IpcResult<Paginated<Product>>>
    get: (id: string) => Promise<IpcResult<Product>>
    create: (input: ProductUpsertInput) => Promise<IpcResult<Product>>
    update: (input: ProductUpsertInput) => Promise<IpcResult<Product>>
    archive: (id: string) => Promise<IpcResult<void>>
    search: (term: string) => Promise<IpcResult<Product[]>>
    byBarcode: (barcode: string) => Promise<IpcResult<Product | null>>
  }
  modifiers: {
    list: () => Promise<IpcResult<ModifierGroup[]>>
    save: (input: ModifierGroupInput) => Promise<IpcResult<ModifierGroup>>
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
    list: () => Promise<IpcResult<Supplier[]>>
    save: (input: SupplierInput) => Promise<IpcResult<Supplier>>
  }
  purchaseOrders: {
    list: (status?: string) => Promise<IpcResult<PurchaseOrder[]>>
    get: (id: string) => Promise<IpcResult<PurchaseOrder>>
    create: (input: PurchaseOrderInput) => Promise<IpcResult<PurchaseOrder>>
    send: (id: string) => Promise<IpcResult<void>>
    receivePartial: (
      id: string,
      received: { itemId: string; qtyMilli: number }[]
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
    saveZone: (input: ZoneInput) => Promise<IpcResult<Zone>>
    saveTable: (input: FloorTableInput) => Promise<IpcResult<RestaurantTable>>
  }
  tables: {
    open: (input: TableOpenInput) => Promise<IpcResult<Order>>
    close: (tableId: string) => Promise<IpcResult<void>>
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
  hardware: {
    testPrinter: () => Promise<IpcResult<string>>
    openDrawer: () => Promise<IpcResult<void>>
    virtualScan: (barcode: string) => void
    isPrinterAvailable: () => Promise<IpcResult<boolean>>
    openCustomerDisplay: () => Promise<IpcResult<{ open: boolean }>>
  }
  display: {
    /** Push cart state to the customer display window (fire-and-forget). */
    push: (cart: unknown) => void
  }
  events: {
    /** Subscribe to main-process events. Returns unsubscribe. */
    on: (channel: string, cb: (payload: unknown) => void) => () => void
  }
}
