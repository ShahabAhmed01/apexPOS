import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { RestaurantService } from '../services/restaurantService'

export const registerRestaurantIpc = (services: Services, sessionStore: SessionStore): void => {
  const restaurant = services.restaurant as RestaurantService

  handle(IpcChannel.FloorsGet, {
    permission: 'tables.view',
    handler: () => ({ zones: restaurant.zones(), tables: restaurant.tables() })
  }, services, () => sessionStore.get())

  handle(IpcChannel.FloorsSave, {
    permission: 'tables.manage',
    schema: z.object({
      id: z.string().uuid().optional(),
      zoneId: z.string().uuid(),
      name: z.string().min(1).max(40),
      capacity: z.number().int().min(1).max(64),
      shape: z.enum(['square', 'round', 'rect']),
      x: z.number(), y: z.number(), w: z.number(), h: z.number(),
      rotation: z.number()
    }),
    handler: (_ctx, input: Parameters<RestaurantService['saveTable']>[0]) => restaurant.saveTable(input)
  }, services, () => sessionStore.get())

  handle(IpcChannel.TablesOpen, {
    permission: 'tables.manage',
    schema: z.object({ tableId: z.string().uuid(), guests: z.number().int().min(1).max(64), serverId: z.string().uuid().optional() }),
    handler: (ctx, input: { tableId: string; guests: number; serverId?: string }) =>
      restaurant.openTable(input.tableId, input.guests, input.serverId ?? ctx.session!.user.id)
  }, services, () => sessionStore.get())

  handle(IpcChannel.TablesClose, {
    permission: 'tables.manage',
    schema: z.object({ tableId: z.string().uuid() }),
    handler: (_ctx, input: { tableId: string }) => restaurant.closeTable(input.tableId)
  }, services, () => sessionStore.get())

  handle(IpcChannel.KitchenBoard, {
    permission: 'kitchen.view',
    handler: () => restaurant.kitchenBoard()
  }, services, () => sessionStore.get())

  handle(IpcChannel.KitchenBump, {
    permission: 'kitchen.manage',
    schema: z.object({ orderId: z.string().uuid() }),
    handler: (_ctx, input: { orderId: string }) => restaurant.bumpTicket(input.orderId)
  }, services, () => sessionStore.get())
}
