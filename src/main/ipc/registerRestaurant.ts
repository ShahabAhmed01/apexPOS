import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { RestaurantService } from '../services/restaurantService'

export const registerRestaurantIpc = (services: Services, sessionStore: SessionStore): void => {
  const restaurant = services.restaurant as RestaurantService

  handle(
    IpcChannel.FloorsGet,
    {
      permission: 'tables.view',
      handler: () => ({ zones: restaurant.zones(), tables: restaurant.tables() })
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.FloorsSave,
    {
      permission: 'tables.manage',
      schema: z.object({
        id: z.string().uuid().optional(),
        zoneId: z.string().uuid(),
        name: z.string().min(1).max(40),
        capacity: z.number().int().min(1).max(64),
        shape: z.enum(['square', 'round', 'rect']),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        rotation: z.number()
      }),
      handler: (_ctx, input: Parameters<RestaurantService['saveTable']>[0]) =>
        restaurant.saveTable(input)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesOpen,
    {
      // Seating a party creates the table's sales order, so `sales.create`
      // is the semantic permission — restricting this to `tables.manage`
      // locked waiters out of their own core job (LT-009). Floor-plan
      // *editing* (FloorsSave) and closing a table stay on `tables.manage`.
      anyOfPermissions: ['tables.manage', 'sales.create'],
      schema: z.object({
        tableId: z.string().uuid(),
        guests: z.number().int().min(1).max(64),
        serverId: z.string().uuid().optional()
      }),
      handler: (ctx, input: { tableId: string; guests: number; serverId?: string }) =>
        restaurant.openTable(input.tableId, input.guests, input.serverId ?? ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesClose,
    {
      permission: 'tables.manage',
      schema: z.object({ tableId: z.string().uuid() }),
      handler: (ctx, input: { tableId: string }) =>
        restaurant.closeTable(input.tableId, ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesTransfer,
    {
      permission: 'tables.transfer',
      schema: z.object({ orderId: z.string().uuid(), targetTableId: z.string().uuid() }),
      handler: (ctx, input: { orderId: string; targetTableId: string }) =>
        restaurant.transferOrderToTable(input.orderId, input.targetTableId, ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesRequestBill,
    {
      permission: 'tables.manage',
      schema: z.object({ orderId: z.string().uuid() }),
      handler: (_ctx, input: { orderId: string }) =>
        restaurant.setOrderStatus(input.orderId, 'billed')
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesMoveLines,
    {
      permission: 'tables.transfer',
      schema: z.object({
        orderId: z.string().uuid(),
        lineIds: z.array(z.string().uuid()).min(1).max(500),
        targetTableId: z.string().uuid()
      }),
      handler: (ctx, input: { orderId: string; lineIds: string[]; targetTableId: string }) =>
        restaurant.moveLines(
          input.orderId,
          input.lineIds,
          input.targetTableId,
          ctx.session!.user.id
        )
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.TablesMerge,
    {
      permission: 'tables.transfer',
      schema: z.object({ orderId: z.string().uuid(), targetTableId: z.string().uuid() }),
      handler: (ctx, input: { orderId: string; targetTableId: string }) =>
        restaurant.mergeTables(input.orderId, input.targetTableId, ctx.session!.user.id)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.KitchenBoard,
    {
      permission: 'kitchen.view',
      handler: () => restaurant.kitchenBoard()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.KitchenBump,
    {
      permission: 'kitchen.manage',
      schema: z.object({ orderId: z.string().uuid() }),
      handler: (_ctx, input: { orderId: string }) => restaurant.bumpTicket(input.orderId)
    },
    services,
    () => sessionStore.get()
  )

  // --- LT-008: fire / recall / per-item status -----------------------------
  // These three channels were declared in the shared contract but never
  // registered, so no renderer could ever move an order into
  // `sent_to_kitchen` — the KDS board was permanently empty.
  handle(
    IpcChannel.OrdersFireCourse,
    {
      // Whoever can take an order can send it to the kitchen; kitchen staff
      // can re-fire a course after a correction.
      anyOfPermissions: ['sales.create', 'kitchen.manage'],
      schema: z.object({
        orderId: z.string().uuid(),
        course: z.string().max(32).optional()
      }),
      handler: (ctx, input: { orderId: string; course?: string }) => {
        restaurant.sendToKitchen(input.orderId, input.course, ctx.session!.user.id)
        return restaurant.kitchenBoard()
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OrdersItemStatus,
    {
      anyOfPermissions: ['kitchen.manage', 'sales.create'],
      schema: z.object({
        lineId: z.string().uuid(),
        status: z.enum(['queued', 'fired', 'preparing', 'ready', 'served'])
      }),
      handler: (
        _ctx,
        input: { lineId: string; status: 'queued' | 'fired' | 'preparing' | 'ready' | 'served' }
      ) => restaurant.setLineStatus(input.lineId, input.status)
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.KitchenRecall,
    {
      permission: 'kitchen.manage',
      schema: z.object({ orderId: z.string().uuid() }),
      handler: (ctx, input: { orderId: string }) => {
        restaurant.recallTicket(input.orderId, ctx.session!.user.id)
        return restaurant.kitchenBoard()
      }
    },
    services,
    () => sessionStore.get()
  )
}
