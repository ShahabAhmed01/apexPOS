import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { ProductService } from '../services/productService'
import type { RegisterService } from '../services/registerService'
import type { ReportService } from '../services/reportService'
import type { DB } from '../db/database'
import type { StockReason } from '@shared/types/models'
import type { StockAdjustInput } from '@shared/ipc/api'

interface StockMovementRow {
  id: string
  product_id: string
  variant_id: string | null
  branch_id: string
  qty_delta: number
  reason: StockReason
  ref_type: string | null
  ref_id: string | null
  unit_cost: number | null
  note: string | null
  user_id: string
  created_at: string
}

const sessionOr = (sessionStore: SessionStore): { userId: string } => {
  const s = sessionStore.get()
  if (!s) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
  return { userId: s.user.id }
}

export const registerCatalogIpc = (services: Services, sessionStore: SessionStore): void => {
  const products = services.products as ProductService
  const registers = services.registers as RegisterService
  const db = services.db as DB

  handle(
    IpcChannel.ProductsList,
    {
      anyOfPermissions: ['inventory.view', 'sales.view'],
      schema: z.object({
        search: z.string().max(128).optional(),
        categoryId: z.string().uuid().optional(),
        includeInactive: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().nonnegative().optional()
      }),
      handler: (_ctx, input: Parameters<typeof products.list>[0]) => products.list(input)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.ProductsSearch,
    {
      anyOfPermissions: ['inventory.view', 'sales.view'],
      schema: z.object({ term: z.string().max(128) }),
      handler: (_ctx, input: { term: string }) => products.search(input.term)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.ProductsByBarcode,
    {
      permission: 'sales.create',
      schema: z.object({ barcode: z.string().min(1).max(64) }),
      handler: (_ctx, input: { barcode: string }) => products.byBarcode(input.barcode)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.ProductsGet,
    {
      anyOfPermissions: ['inventory.view', 'sales.view'],
      schema: z.object({ id: z.string() }),
      handler: (_ctx, input: { id: string }) => products.get(input.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterOpen,
    {
      permission: 'register.open',
      schema: z.object({
        registerId: z.string().uuid(),
        openingFloat: z.number().int().nonnegative()
      }),
      handler: (_ctx, input: { registerId: string; openingFloat: number }) =>
        registers.open(input.registerId, input.openingFloat, sessionOr(sessionStore).userId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterCurrent,
    {
      requiresAuth: true,
      handler: (ctx) => {
        const rows = db
          .prepare(`SELECT * FROM shifts WHERE status = 'open' AND branch_id = ?`)
          .all(ctx.session!.branchId) as { id: string; register_id: string }[]
        if (rows.length === 0) return null
        return registers.byId(rows[0]!.id)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterClose,
    {
      permission: 'register.close',
      schema: z.object({
        countedCash: z.number().int().nonnegative(),
        note: z.string().max(240).optional(),
        blind: z.boolean().optional()
      }),
      handler: (ctx, input: { countedCash: number; note?: string; blind?: boolean }) => {
        const open = db
          .prepare(`SELECT register_id FROM shifts WHERE status = 'open' AND branch_id = ? LIMIT 1`)
          .get(ctx.session!.branchId) as { register_id: string } | undefined
        if (!open) throw new AppError(ErrorCode.NotFound, 'No open shift on this terminal.')
        return registers.close(
          open.register_id,
          input.countedCash,
          sessionOr(sessionStore).userId,
          input.note
        )
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterCashMovement,
    {
      permission: 'cash.adjust',
      schema: z.object({
        kind: z.enum(['pay_in', 'pay_out']),
        amount: z.number().int().positive(),
        reason: z.string().min(2).max(200)
      }),
      handler: (ctx, input: { kind: 'pay_in' | 'pay_out'; amount: number; reason: string }) => {
        const open = db
          .prepare(`SELECT id FROM shifts WHERE status = 'open' AND branch_id = ? LIMIT 1`)
          .get(ctx.session!.branchId) as { id: string } | undefined
        if (!open) throw new AppError(ErrorCode.NotFound, 'No open shift.')
        if (input.kind === 'pay_in')
          registers.payIn(open.id, input.amount, input.reason, sessionOr(sessionStore).userId)
        else registers.payOut(open.id, input.amount, input.reason, sessionOr(sessionStore).userId)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.CategoriesList,
    {
      anyOfPermissions: ['inventory.view', 'sales.view'],
      handler: () =>
        db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name').all()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TaxesList,
    {
      anyOfPermissions: ['sales.view', 'inventory.manage', 'settings.manage'],
      handler: () =>
        db
          .prepare(
            `SELECT id, name, rate_bps AS rateBps, inclusive, is_default AS isDefault, is_active AS isActive
             FROM taxes ORDER BY is_default DESC, name`
          )
          .all()
          .map((r) => {
            const row = r as {
              id: string
              name: string
              rateBps: number
              inclusive: number
              isDefault: number
              isActive: number
            }
            return {
              id: row.id,
              name: row.name,
              rateBps: row.rateBps,
              inclusive: row.inclusive === 1,
              isDefault: row.isDefault === 1,
              isActive: row.isActive === 1
            }
          })
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.DiscountsList,
    {
      anyOfPermissions: ['sales.view', 'inventory.manage', 'settings.manage'],
      handler: () =>
        db
          .prepare(
            `SELECT id, name, kind, value, max_amount_minor AS maxAmountMinor,
                    requires_manager AS requiresManager, is_active AS isActive
             FROM discounts WHERE is_active = 1 ORDER BY name`
          )
          .all()
          .map((r) => {
            const row = r as {
              id: string
              name: string
              kind: string
              value: number
              maxAmountMinor: number | null
              requiresManager: number
              isActive: number
            }
            return {
              id: row.id,
              name: row.name,
              kind: row.kind,
              value: row.value,
              maxAmountMinor: row.maxAmountMinor ?? undefined,
              requiresManager: row.requiresManager === 1,
              isActive: row.isActive === 1
            }
          })
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.ModifiersList,
    {
      anyOfPermissions: ['sales.view', 'inventory.view', 'tables.manage'],
      handler: () => {
        const groups = db
          .prepare(
            'SELECT id, name, min_select, max_select, required FROM modifier_groups ORDER BY name'
          )
          .all() as {
          id: string
          name: string
          min_select: number
          max_select: number
          required: number
        }[]
        const optStmt = db.prepare(
          'SELECT id, group_id, name, price_delta, is_default, is_active FROM modifier_options WHERE group_id = ? ORDER BY name'
        )
        return groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.min_select,
          maxSelect: g.max_select,
          required: g.required === 1,
          options: (
            optStmt.all(g.id) as {
              id: string
              group_id: string
              name: string
              price_delta: number
              is_default: number
              is_active: number
            }[]
          ).map((o) => ({
            id: o.id,
            groupId: o.group_id,
            name: o.name,
            priceDelta: o.price_delta,
            isDefault: o.is_default === 1,
            isActive: o.is_active === 1
          }))
        }))
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterXReport,
    {
      permission: 'register.close',
      handler: (ctx) => {
        const open = db
          .prepare(`SELECT id FROM shifts WHERE status = 'open' AND branch_id = ? LIMIT 1`)
          .get(ctx.session!.branchId) as { id: string } | undefined
        if (!open) throw new AppError(ErrorCode.NotFound, 'No open shift on this terminal.')
        return (services.reports as ReportService).shiftReport(open.id)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.RegisterZReport,
    {
      permission: 'cash.view_variance',
      handler: (ctx) => {
        const closed = db
          .prepare(
            `SELECT id FROM shifts WHERE status = 'closed' AND branch_id = ? ORDER BY closed_at DESC LIMIT 1`
          )
          .get(ctx.session!.branchId) as { id: string } | undefined
        if (!closed) throw new AppError(ErrorCode.NotFound, 'No closed shift yet.')
        return (services.reports as ReportService).shiftReport(closed.id)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.InventoryOnHand,
    {
      anyOfPermissions: ['inventory.view', 'sales.view'],
      schema: z.object({ productId: z.string().uuid() }),
      handler: (_ctx, input: { productId: string }) => products.onHand(input.productId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.InventoryMovements,
    {
      permission: 'inventory.view',
      schema: z.object({
        productId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(1000).optional()
      }),
      handler: (_ctx, input: { productId?: string; limit?: number }) => {
        const limit = input.limit ?? 200
        const rows = (
          input.productId
            ? db
                .prepare(
                  `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?`
                )
                .all(input.productId, limit)
            : db
                .prepare(`SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT ?`)
                .all(limit)
        ) as StockMovementRow[]
        return rows.map((m) => ({
          id: m.id,
          productId: m.product_id,
          variantId: m.variant_id ?? undefined,
          branchId: m.branch_id,
          qtyDelta: m.qty_delta,
          reason: m.reason,
          refType: m.ref_type ?? undefined,
          refId: m.ref_id ?? undefined,
          unitCost: m.unit_cost ?? undefined,
          note: m.note ?? undefined,
          userId: m.user_id,
          createdAt: m.created_at
        }))
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.InventoryAdjust,
    {
      permission: 'inventory.adjust',
      schema: z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        qtyDeltaMilli: z
          .number()
          .int()
          .refine((v) => v !== 0, 'Adjustment must be non-zero')
          .refine((v) => Math.abs(v) <= 1e9, 'Adjustment out of range'),
        reason: z.enum(['adjustment', 'waste']),
        note: z.string().trim().min(2).max(200),
        managerPin: z.string().min(1).max(32)
      }),
      handler: (ctx, input: StockAdjustInput) => products.adjustStock(input, ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.InventoryLowStock,
    {
      permission: 'inventory.view',
      handler: () => products.lowStock()
    },
    services,
    () => sessionStore.get()
  )

  void registers
}
