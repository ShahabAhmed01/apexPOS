import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { CustomerService } from '../services/customerService'

const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional()
})

export const registerCustomersIpc = (services: Services, sessionStore: SessionStore): void => {
  const customers = services.customers as CustomerService

  handle(IpcChannel.CustomersList, {
    permission: 'customers.view',
    schema: z.object({ search: z.string().optional() }).optional(),
    handler: (_ctx, args?: { search?: string }) => customers.list(args?.search)
  }, services, () => sessionStore.get())

  handle(IpcChannel.CustomersSave, {
    permission: 'customers.manage',
    schema: customerSchema,
    handler: (_ctx, input: z.infer<typeof customerSchema>) => customers.save(input)
  }, services, () => sessionStore.get())

  handle(IpcChannel.CustomersAdjustLoyalty, {
    permission: 'customers.credit',
    schema: z.object({
      id: z.string(),
      delta: z.number().int().refine((n) => n !== 0),
      reason: z.string().min(1).max(200)
    }),
    handler: (_ctx, input: { id: string; delta: number; reason: string }) =>
      customers.adjustLoyalty(input.id, input.delta, input.reason)
  }, services, () => sessionStore.get())

  handle(IpcChannel.GiftCardsList, {
    permission: 'customers.view',
    handler: () => customers.listGiftCards()
  }, services, () => sessionStore.get())

  handle(IpcChannel.GiftCardsIssue, {
    permission: 'customers.credit',
    schema: z.object({
      code: z.string().min(4).max(24).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only'),
      amount: z.number().int().positive()
    }),
    handler: (_ctx, input: { code: string; amount: number }) => customers.issueGiftCard(input.code, input.amount)
  }, services, () => sessionStore.get())

  handle(IpcChannel.GiftCardsBalance, {
    permission: 'customers.view',
    schema: z.object({ code: z.string().min(1) }),
    handler: (_ctx, input: { code: string }) => customers.getGiftCard(input.code).balance
  }, services, () => sessionStore.get())
}
