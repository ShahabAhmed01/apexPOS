/**
 * Canonical domain models shared by main, preload and renderer.
 * Row types mirror the SQLite schema (snake_case columns live only in the
 * repository layer; everything past the repository boundary uses these shapes).
 */
import type { Money } from '../lib/money'
import type { QtyMilli } from '../lib/quantity'

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface Organization {
  id: string
  name: string
  legalName?: string
  taxId?: string
  currency: string
  timezone: string
  createdAt: string
}

export interface Branch {
  id: string
  organizationId: string
  name: string
  code: string
  address?: string
  phone?: string
  isActive: boolean
}

export interface Register {
  id: string
  branchId: string
  name: string
  code: string
  isActive: boolean
}

export interface Terminal {
  id: string
  branchId: string
  registerId?: string
  name: string
  deviceKey: string
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type RoleName =
  | 'Owner'
  | 'Administrator'
  | 'Manager'
  | 'Cashier'
  | 'Waiter'
  | 'Kitchen Staff'
  | 'Inventory Manager'
  | 'Purchasing Manager'
  | 'Accountant'
  | 'Auditor'
  | (string & {})

export interface Role {
  id: string
  name: RoleName
  description?: string
  isSystem: boolean
  permissions: string[]
}

export interface User {
  id: string
  username: string
  displayName: string
  roleId: string
  roleName: RoleName
  branchId?: string
  pinEnabled: boolean
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
}

export interface SessionInfo {
  token: string
  user: User
  permissions: string[]
  branchId: string
  terminalId: string
  expiresAt: string
  locked: boolean
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Category {
  id: string
  name: string
  parentId?: string
  sortOrder: number
  isActive: boolean
}

export interface Unit {
  id: string
  code: string
  name: string
  decimals: number
  baseUnitId?: string
  ratioToBase?: number
}

export type ProductType = 'standard' | 'variant_parent' | 'service'

export interface Product {
  id: string
  sku: string
  barcode?: string
  name: string
  description?: string
  categoryId?: string
  brandId?: string
  type: ProductType
  unitId: string
  unitCode: string
  price: Money
  cost: Money
  taxId?: string
  /** Resolved rate in basis points, from the linked tax row (0 when untaxed). */
  taxBps: number
  trackStock: boolean
  stockOnHand: QtyMilli
  lowStockThreshold?: QtyMilli
  isWeighted: boolean
  isActive: boolean
  imagePath?: string
  tags: string[]
  variants: ProductVariant[]
  modifierGroupIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ProductVariant {
  id: string
  productId: string
  sku: string
  barcode?: string
  name: string
  attributes: Record<string, string>
  price: Money
  cost: Money
  stockOnHand: QtyMilli
  isActive: boolean
}

export interface ModifierGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  required: boolean
  options: ModifierOption[]
}

export interface ModifierOption {
  id: string
  groupId: string
  name: string
  priceDelta: Money
  isDefault: boolean
  isActive: boolean
}

export interface TaxRate {
  id: string
  name: string
  /** Integer basis points (17% = 1700). Integer-only for exact math. */
  rateBps: number
  inclusive: boolean
  isDefault: boolean
  isActive: boolean
}

export type DiscountKind = 'percent' | 'amount'

export interface Discount {
  id: string
  name: string
  kind: DiscountKind
  /** percent → basis points; amount → minor units */
  value: number
  maxAmountMinor?: Money
  requiresManager: boolean
  isActive: boolean
}

// ---------------------------------------------------------------------------
// Orders / POS
// ---------------------------------------------------------------------------

export type OrderType = 'retail' | 'dine_in' | 'takeaway'
export type OrderStatus =
  | 'draft'
  | 'held'
  | 'open'
  | 'sent_to_kitchen'
  | 'partially_served'
  | 'served'
  | 'billed'
  | 'completed'
  | 'void'

export interface OrderLineModifier {
  id: string
  modifierOptionId: string
  name: string
  priceDelta: Money
}

export interface OrderLine {
  id: string
  orderId: string
  productId: string
  variantId?: string
  sku: string
  name: string
  quantity: QtyMilli
  unitPrice: Money
  lineDiscount: Money
  taxBps: number
  taxAmount: Money
  lineTotal: Money
  kitchenStation?: string
  course?: string
  seat?: number
  notes?: string
  allergyFlag: boolean
  status: 'queued' | 'fired' | 'preparing' | 'ready' | 'served' | 'void'
  modifiers: OrderLineModifier[]
}

export interface Order {
  id: string
  number: number
  numberLabel: string
  type: OrderType
  status: OrderStatus
  branchId: string
  registerId?: string
  terminalId: string
  shiftId?: string
  userId: string
  userName: string
  customerId?: string
  customerName?: string
  tableId?: string
  tableName?: string
  lines: OrderLine[]
  subtotal: Money
  discountTotal: Money
  taxTotal: Money
  serviceCharge: Money
  tip: Money
  roundingAdjustment: Money
  total: Money
  amountPaid: Money
  changeGiven: Money
  holdName?: string
  createdAt: string
  completedAt?: string
  voidedAt?: string
  voidReason?: string
}

export type PaymentMethod =
  'cash' | 'card' | 'mobile_wallet' | 'gift_card' | 'store_credit' | 'bank_transfer' | 'voucher'

export interface Payment {
  id: string
  orderId: string
  method: PaymentMethod
  amount: Money
  tendered?: Money
  change?: Money
  reference?: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded'
  cardBrand?: string
  cardLast4?: string
  approvalCode?: string
  createdAt: string
}

export interface Refund {
  id: string
  orderId: string
  number: number
  reason: string
  total: Money
  approvedBy?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Register / shifts
// ---------------------------------------------------------------------------

export type ShiftStatus = 'open' | 'closed'

export interface Shift {
  id: string
  branchId: string
  registerId: string
  userId: string
  status: ShiftStatus
  openingFloat: Money
  expectedCash?: Money
  countedCash?: Money
  variance?: Money
  openedAt: string
  closedAt?: string
  note?: string
}

export type CashMovementKind = 'pay_in' | 'pay_out' | 'no_sale'

export interface CashMovement {
  id: string
  shiftId: string
  kind: CashMovementKind
  amount: Money
  reason: string
  userId: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export type StockReason =
  | 'sale'
  | 'refund'
  | 'receive'
  | 'adjustment'
  | 'waste'
  | 'transfer_out'
  | 'transfer_in'
  | 'stocktake'
  | 'initial'

export interface StockMovement {
  id: string
  productId: string
  variantId?: string
  branchId: string
  qtyDelta: QtyMilli
  reason: StockReason
  refType?: string
  refId?: string
  unitCost?: Money
  note?: string
  userId: string
  createdAt: string
}

export interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  isActive: boolean
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  id: string
  productId: string
  variantId?: string
  sku: string
  name: string
  qtyOrdered: QtyMilli
  qtyReceived: QtyMilli
  unitCost: Money
}

export interface PurchaseOrder {
  id: string
  number: number
  supplierId: string
  supplierName: string
  branchId: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  expectedAt?: string
  notes?: string
  createdById: string
  createdAt: string
  sentAt?: string
  receivedAt?: string
}

// ---------------------------------------------------------------------------
// Restaurant
// ---------------------------------------------------------------------------

export interface Zone {
  id: string
  branchId: string
  name: string
  sortOrder: number
}

export type TableStatus = 'free' | 'seated' | 'ordered' | 'served' | 'bill' | 'dirty'
export type TableShape = 'square' | 'round' | 'rect'

export interface RestaurantTable {
  id: string
  zoneId: string
  name: string
  capacity: number
  shape: TableShape
  x: number
  y: number
  w: number
  h: number
  rotation: number
  status: TableStatus
  activeOrderId?: string
  serverName?: string
  guests?: number
}

// ---------------------------------------------------------------------------
// Customers / loyalty
// ---------------------------------------------------------------------------

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  tags: string[]
  loyaltyPoints: number
  storeCredit: Money
  totalSpent: Money
  orderCount: number
  lastOrderAt?: string
  isActive: boolean
  createdAt: string
}

export interface GiftCard {
  id: string
  code: string
  initialBalance: Money
  balance: Money
  status: 'active' | 'depleted' | 'deactivated'
  expiresAt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string
  actorId?: string
  actorName?: string
  action: string
  entity: string
  entityId?: string
  branchId?: string
  terminalId?: string
  context?: Record<string, unknown>
  createdAt: string
}

export interface AppNotification {
  id: string
  kind: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body?: string
  entity?: string
  entityId?: string
  isRead: boolean
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
