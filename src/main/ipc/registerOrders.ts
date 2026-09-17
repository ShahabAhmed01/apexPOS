import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { OrderService } from '../services/orderService'
import type { PaymentService } from '../services/paymentService'

const cartLineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantityMilli: z.number().int().positive().max(10_000_000),
  unitPriceOverride: z.number().int().nonnegative().optional(),
  lineDiscountMinor: z.number().int().nonnegative().optional(),
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
    .object({ kind: z.enum(['percent', 'amount']), value: z.number().nonnegative() })
    .optional(),
  tip: z.number().int().nonnegative().optional(),
  holdName: z.string().max(60).optional(),
  clientOpId: z.string().uuid()
})

const tenderSchema = z.object({
  orderId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'card', 'mobile_wallet', 'gift_card', 'store_credit', 'bank_transfer', 'voucher']),
        amount: z.number().int().positive(),
        tendered: z.number().int().positive().optional(),
        reference: z.string().max(64).optional(),
        giftCardCode: z.string().max(32).optional(),
        simulateOutcome: z.enum(['approved', 'declined']).optional()
      })
    )
    .min(1)
    .max(8),
  serviceCharge: z.number().int().nonnegative().optional(),
  tip: z.number().int().nonnegative().optional(),
  clientOpId: z.string().uuid()
})

const refundSchema = z.object({
  orderId: z.string().uuid(),
  lines: z
    .array(z.object({ orderLineId: z.string().uuid(), qtyMilli: z.number().int().positive() }))
    .min(1),
  reason: z.string().min(3).max(200),
  refundMethod: z.enum(['original', 'cash', 'store_credit']),
  managerUserId: z.string().uuid(),
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

  handle(IpcChannel.OrdersCreate, {
    schema: createOrderSchema,
    permission: 'sales.create',
    handler: (_ctx, input: Parameters<typeof orders.createOrder>[0]) =>
      orders.createOrder(input, mustSession(sessionStore))
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersGet, {
    schema: z.object({ id: z.string().uuid() }),
    permission: 'sales.view',
    handler: (_ctx, input: { id: string }) => orders.getOrder(input.id)
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersUpdateDraft, {
    schema: createOrderSchema.extend({ orderId: z.string().uuid() }),
    permission: 'sales.create',
    handler: (_ctx, input: Parameters<typeof orders.updateDraft>[1] & { orderId: string }) =>
      orders.updateDraft(input.orderId, input, mustSession(sessionStore))
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersHold, {
    schema: z.object({ id: z.string().uuid(), holdName: z.string().max(60).optional() }),
    permission: 'sales.create',
    handler: (_ctx, input: { id: string; holdName?: string }) =>
      orders.hold(input.id, input.holdName, mustSession(sessionStore).userId)
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersRecall, {
    schema: z.object({ id: z.string().uuid() }),
    permission: 'sales.create',
    handler: (_ctx, input: { id: string }) => orders.recall(input.id, mustSession(sessionStore).userId)
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersListHeld, {
    permission: 'sales.view',
    handler: () => orders.listHeld()
  }, services, () => sessionStore.get())

  handle(IpcChannel.OrdersVoid, {
    schema: z.object({ id: z.string().uuid(), reason: z.string().min(3).max(200) }),
    permission: 'sales.void',
    handler: (ctx, input: { id: string; reason: string }) =>
      orders.voidOrder(input.id, input.reason, ctx.session!.user.id, ctx.session!.user.id)
  }, services, () => sessionStore.get())

  handle(IpcChannel.PaymentsTender, {
    schema: tenderSchema,
    permission: 'payments.take',
    handler: (_ctx, input: Parameters<typeof payments.tender>[0]) =>
      payments.tender(input, mustSession(sessionStore).userId)
  }, services, () => sessionStore.get())

  handle(IpcChannel.PaymentsRefund, {
    schema: refundSchema,
    permission: 'sales.refund',
    handler: (_ctx, input: Parameters<typeof payments.refund>[0]) =>
      payments.refund(input, mustSession(sessionStore).userId)
  }, services, () => sessionStore.get())
}
