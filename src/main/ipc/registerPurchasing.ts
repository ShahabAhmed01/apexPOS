import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { PurchaseService } from '../services/purchaseService'
import type { PurchaseOrderInput, SupplierInput } from '@shared/ipc/api'
import type { SessionInfo } from '@shared/types/models'

const supplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).or(z.literal('')).optional(),
  address: z.string().trim().max(240).optional()
})

const poItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  qtyMilli: z.number().int().positive().max(1e9),
  unitCost: z.number().int().min(0).max(1e12)
})

const poCreateSchema = z.object({
  supplierId: z.string().uuid(),
  expectedAt: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(poItemSchema).min(1).max(500)
})

const receiveSchema = z.object({
  id: z.string().uuid(),
  received: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qtyMilli: z.number().int().positive().max(1e9)
      })
    )
    .min(1)
    .max(500),
  /** Client-generated idempotency key; safe to retry a receive. */
  clientOpId: z.string().min(8).max(80).optional()
})

export const registerPurchasingIpc = (services: Services, sessionStore: SessionStore): void => {
  const purchasing = services.purchasing as PurchaseService
  // The permission gate in `handle` already rejects anonymous callers, so the
  // session is guaranteed present inside these handlers.
  const uid = (ctx: { session: SessionInfo | null }): string => ctx.session!.user.id

  handle(
    IpcChannel.SuppliersList,
    {
      permission: 'purchases.view',
      schema: z.object({ search: z.string().max(80).optional() }).optional(),
      handler: (_ctx, input?: { search?: string }) => purchasing.listSuppliers(input?.search)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.SuppliersSave,
    {
      permission: 'purchases.create',
      schema: supplierSchema,
      handler: (ctx, input: SupplierInput) => purchasing.saveSupplier(input, uid(ctx))
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersList,
    {
      permission: 'purchases.view',
      schema: z
        .object({
          status: z.enum(['draft', 'sent', 'partial', 'received', 'cancelled']).optional()
        })
        .optional(),
      handler: (_ctx, input?: { status?: string }) => purchasing.listPOs(input?.status)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersGet,
    {
      permission: 'purchases.view',
      schema: z.object({ id: z.string().uuid() }),
      handler: (_ctx, input: { id: string }) => purchasing.getPO(input.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersCreate,
    {
      permission: 'purchases.create',
      schema: poCreateSchema,
      handler: (ctx, input: PurchaseOrderInput) => purchasing.createPO(input, uid(ctx))
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersSend,
    {
      permission: 'purchases.approve',
      schema: z.object({ id: z.string().uuid() }),
      handler: (ctx, input: { id: string }) => purchasing.sendPO(input.id, uid(ctx))
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersReceive,
    {
      permission: 'purchases.receive',
      schema: receiveSchema,
      handler: (
        ctx,
        input: { id: string; received: { itemId: string; qtyMilli: number }[]; clientOpId?: string }
      ) => purchasing.receivePO(input.id, input.received, uid(ctx), input.clientOpId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PurchaseOrdersCancel,
    {
      permission: 'purchases.approve',
      schema: z.object({ id: z.string().uuid() }),
      handler: (ctx, input: { id: string }) => purchasing.cancelPO(input.id, uid(ctx))
    },
    services,
    () => sessionStore.get()
  )
}
