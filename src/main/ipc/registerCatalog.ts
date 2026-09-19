import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { ProductService } from '../services/productService'
import type { RegisterService } from '../services/registerService'
import type { DB } from '../db/database'
import type { StockReason } from '@shared/types/models'

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
      handler: (_ctx, input: { countedCash: number; note?: string; blind?: boolean }) => {
        const open = db
          .prepare(`SELECT register_id FROM shifts WHERE status = 'open' LIMIT 1`)
          .get() as { register_id: string } | undefined
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
      handler: (_ctx, input: { kind: 'pay_in' | 'pay_out'; amount: number; reason: string }) => {
        const open = db.prepare(`SELECT id FROM shifts WHERE status = 'open' LIMIT 1`).get() as
          { id: string } | undefined
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
