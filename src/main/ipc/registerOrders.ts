import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { OrderService } from '../services/orderService'
import type { PaymentService } from '../services/paymentService'
import type { DB } from '../db/database'
import { renderReceiptText } from '../hardware/receipt'

const cartLineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantityMilli: z.number().int().positive().max(10_000_000),
  unitPriceOverride: z.number().int().nonnegative().max(1_000_000_000).optional(),
  lineDiscountMinor: z.number().int().nonnegative().max(1_000_000_000).optional(),
  course: z.string().max(32).optional(),
  seat: z.number().int().positive().optional(),
  notes: z.string().max(200).optional(),
  modifierOptionIds: z.array(z.string().uuid()).max(12).optional()
})

const createOrderSchema = z.object({
  type: z.enum(['retail', 'dine_in', 'takeaway']),
  registerId: z.string().optional(),
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  lines: z.array(cartLineSchema).min(1).max(500),
  cartDiscount: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('percent'), value: z.number().int().min(0).max(10_000) }),
      z.object({ kind: z.literal('amount'), value: z.number().int().min(0).max(1_000_000_000) })
    ])
    .optional(),
  tip: z.number().int().nonnegative().max(1_000_000_000).optional(),
  holdName: z.string().max(60).optional(),
  clientOpId: z.string().uuid()
})

const tenderSchema = z.object({
  orderId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.enum([
          'cash',
          'card',
          'mobile_wallet',
          'gift_card',
          'store_credit',
          'bank_transfer',
          'voucher'
        ]),
        amount: z.number().int().positive().max(1_000_000_000_000),
        tendered: z.number().int().positive().max(1_000_000_000_000).optional(),
        reference: z.string().max(64).optional(),
        giftCardCode: z.string().max(32).optional(),
        simulateOutcome: z.enum(['approved', 'declined']).optional()
      })
    )
    .min(1)
    .max(8),
  serviceCharge: z.number().int().nonnegative().max(1_000_000_000).optional(),
  tip: z.number().int().nonnegative().max(1_000_000_000).optional(),
  clientOpId: z.string().uuid()
})

const refundSchema = z.object({
  orderId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        orderLineId: z.string().uuid(),
        qtyMilli: z.number().int().positive().max(10_000_000)
      })
    )
    .min(1)
    .max(500),
  reason: z.string().min(3).max(200),
  refundMethod: z.enum(['original', 'cash', 'store_credit']),
  managerPin: z.string().min(4),
  clientOpId: z.string().uuid()
})

const mustSession = (sessionStore: SessionStore): { userId: string; terminalId: string } => {
  const s = sessionStore.get()
  if (!s) throw new AppError(ErrorCode.Unauthorized, 'Not signed in.')
  return { userId: s.user.id, terminalId: s.terminalId }
}

export const registerOrderIpc = (services: Services, sessionStore: SessionStore): void => {
  const orders = services.orders as OrderService
  const payments = services.payments as PaymentService

  handle(
    IpcChannel.OrdersCreate,
    {
      schema: createOrderSchema,
      permission: 'sales.create',
      handler: (_ctx, input: Parameters<typeof orders.createOrder>[0]) =>
        orders.createOrder(input, mustSession(sessionStore))
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersGet,
    {
      schema: z.object({ id: z.string().uuid() }),
      permission: 'sales.view',
      handler: (_ctx, input: { id: string }) => orders.getOrder(input.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersUpdateDraft,
    {
      schema: createOrderSchema.extend({ orderId: z.string().uuid() }),
      permission: 'sales.create',
      handler: (_ctx, input: Parameters<typeof orders.updateDraft>[1] & { orderId: string }) =>
        orders.updateDraft(input.orderId, input, mustSession(sessionStore))
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersHold,
    {
      schema: z.object({ id: z.string().uuid(), holdName: z.string().max(60).optional() }),
      permission: 'sales.create',
      handler: (_ctx, input: { id: string; holdName?: string }) =>
        orders.hold(input.id, input.holdName, mustSession(sessionStore).userId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersRecall,
    {
      schema: z.object({ id: z.string().uuid() }),
      permission: 'sales.create',
      handler: (_ctx, input: { id: string }) =>
        orders.recall(input.id, mustSession(sessionStore).userId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersListHeld,
    {
      permission: 'sales.view',
      handler: () => orders.listHeld()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersVoid,
    {
      schema: z.object({ id: z.string().uuid(), reason: z.string().min(3).max(200) }),
      permission: 'sales.void',
      handler: (ctx, input: { id: string; reason: string }) =>
        orders.voidOrder(input.id, input.reason, ctx.session!.user.id, ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  // Cancel a HELD ticket with ordinary floor permission — the order has no
  // payments and no stock movement, so no manager override is required.
  handle(
    IpcChannel.OrdersCancelHeld,
    {
      schema: z.object({ id: z.string().uuid() }),
      permission: 'sales.create',
      handler: (ctx, input: { id: string }) => {
        const o = orders.getOrder(input.id)
        if (o.status !== 'held') {
          throw new AppError(
            ErrorCode.InvalidState,
            `Order is ${o.status}; only held orders can be cancelled here.`
          )
        }
        orders.voidOrder(
          input.id,
          'Held ticket cancelled',
          ctx.session!.user.id,
          ctx.session!.user.id
        )
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersReceipt,
    {
      schema: z.object({ id: z.string().uuid() }),
      permission: 'sales.view',
      handler: (_ctx, input: { id: string }) => {
        const business = (
          services.settings as {
            get: (k: string) => { name?: string; address?: string; phone?: string }
          }
        ).get('app.business')
        return renderReceiptText(orders.getOrder(input.id), { business })
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PaymentsRecent,
    {
      permission: 'sales.view',
      schema: z.object({ limit: z.number().int().min(1).max(200).optional() }).optional(),
      handler: (ctx, input?: { limit?: number }) => {
        const db = services.db as DB
        const rows = db
          .prepare(
            `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
             WHERE o.branch_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT ?`
          )
          .all(ctx.session!.branchId, input?.limit ?? 50) as {
          id: string
          order_id: string
          method: string
          amount: number
          tendered: number | null
          change_amount: number | null
          reference: string | null
          status: string
          card_brand: string | null
          card_last4: string | null
          approval_code: string | null
          created_at: string
        }[]
        return rows.map((p) => ({
          id: p.id,
          orderId: p.order_id,
          method: p.method,
          amount: p.amount,
          tendered: p.tendered ?? undefined,
          change: p.change_amount ?? undefined,
          reference: p.reference ?? undefined,
          status: p.status,
          cardBrand: p.card_brand ?? undefined,
          cardLast4: p.card_last4 ?? undefined,
          approvalCode: p.approval_code ?? undefined,
          createdAt: p.created_at
        }))
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PaymentsTender,
    {
      schema: tenderSchema,
      permission: 'payments.take',
      handler: (_ctx, input: Parameters<typeof payments.tender>[0]) =>
        payments.tender(input, mustSession(sessionStore).userId)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.PaymentsRefund,
    {
      schema: refundSchema,
      permission: 'sales.refund',
      handler: (_ctx, input: Parameters<typeof payments.refund>[0]) =>
        payments.refund(input, mustSession(sessionStore).userId)
    },
    services,
    () => sessionStore.get()
  )
}
