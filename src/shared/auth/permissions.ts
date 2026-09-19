/**
 * Canonical permission catalog. Every privileged operation in the main process
 * checks one of these keys against the caller's role grant set.
 *
 * The matrix UI and role seeding both derive from this single list.
 */
export const PERMISSION_GROUPS = [
  {
    group: 'sales',
    label: 'Sales',
    permissions: [
      { key: 'sales.view', label: 'View sales' },
      { key: 'sales.create', label: 'Create sales' },
      { key: 'sales.void', label: 'Void orders' },
      { key: 'sales.refund', label: 'Process refunds' },
      { key: 'sales.exchange', label: 'Process exchanges' }
    ]
  },
  {
    group: 'discounts',
    label: 'Discounts',
    permissions: [
      { key: 'discounts.apply', label: 'Apply discounts' },
      { key: 'discounts.override', label: 'Override price / large discounts' }
    ]
  },
  {
    group: 'payments',
    label: 'Payments',
    permissions: [
      { key: 'payments.take', label: 'Take payments' },
      { key: 'payments.refund', label: 'Refund payments' }
    ]
  },
  {
    group: 'inventory',
    label: 'Inventory',
    permissions: [
      { key: 'inventory.view', label: 'View inventory' },
      { key: 'inventory.manage', label: 'Manage products & catalog' },
      { key: 'inventory.adjust', label: 'Adjust stock' },
      { key: 'inventory.receive', label: 'Receive stock' },
      { key: 'inventory.transfer', label: 'Transfer stock' },
      { key: 'inventory.count', label: 'Perform stock counts' }
    ]
  },
  {
    group: 'purchases',
    label: 'Purchasing',
    permissions: [
      { key: 'purchases.view', label: 'View purchasing' },
      { key: 'purchases.create', label: 'Create purchase orders' },
      { key: 'purchases.approve', label: 'Approve purchase orders' },
      { key: 'purchases.receive', label: 'Receive purchase orders' }
    ]
  },
  {
    group: 'customers',
    label: 'Customers',
    permissions: [
      { key: 'customers.view', label: 'View customers' },
      { key: 'customers.manage', label: 'Manage customers' },
      { key: 'customers.credit', label: 'Adjust loyalty / store credit' }
    ]
  },
  {
    group: 'restaurant',
    label: 'Restaurant',
    permissions: [
      { key: 'tables.view', label: 'View floor plan' },
      { key: 'tables.manage', label: 'Manage tables & floor plan' },
      { key: 'tables.transfer', label: 'Transfer / merge tables' },
      { key: 'kitchen.view', label: 'View kitchen display' },
      { key: 'kitchen.manage', label: 'Operate kitchen display' }
    ]
  },
  {
    group: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'View reports' },
      { key: 'reports.export', label: 'Export reports' }
    ]
  },
  {
    group: 'register',
    label: 'Register & Cash',
    permissions: [
      { key: 'register.open', label: 'Open register' },
      { key: 'register.close', label: 'Close register' },
      { key: 'cash.adjust', label: 'Pay in / pay out' },
      { key: 'cash.no_sale', label: 'Open drawer (no sale)' },
      { key: 'cash.view_variance', label: 'View cash variance' }
    ]
  },
  {
    group: 'admin',
    label: 'Administration',
    permissions: [
      { key: 'users.view', label: 'View users' },
      { key: 'users.manage', label: 'Manage users' },
      { key: 'roles.manage', label: 'Manage roles & permissions' },
      { key: 'settings.manage', label: 'Manage settings' },
      { key: 'hardware.manage', label: 'Configure hardware' },
      { key: 'audit.view', label: 'View audit log' },
      { key: 'data.backup', label: 'Create backups' },
      { key: 'data.restore', label: 'Restore backups' },
      { key: 'data.import', label: 'Import data' },
      { key: 'data.reset', label: 'Factory reset' }
    ]
  }
] as const

export type PermissionKey = (typeof PERMISSION_GROUPS)[number]['permissions'][number]['key']

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
)

/** Sensitive operations that additionally require a fresh manager PIN override. */
export const OVERRIDE_GUARDED_ACTIONS = [
  'sales.void',
  'sales.refund',
  'discounts.override',
  'cash.no_sale',
  'cash.adjust',
  'inventory.adjust'
] as const
