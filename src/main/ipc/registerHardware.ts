import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { HardwareService } from '../hardware/hardwareService'
import type { OrderService } from '../services/orderService'
import { openCustomerDisplay } from '../windows/customerDisplay'

export const registerHardwareIpc = (services: Services, sessionStore: SessionStore): void => {
  const hardware = services.hardware as HardwareService

  handle(IpcChannel.HardwareTest, {
    schema: z.object({ device: z.string() }),
    handler: (_ctx, input: { device: string }) => {
      if (input.device === 'printer' || input.device === 'printer-status') {
        return hardware.printerStatus()
      }
      return { device: input.device, state: 'ready' }
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.HardwareOpenDrawer, {
    permission: 'cash.no_sale',
    handler: () => hardware.openDrawer()
  }, services, () => sessionStore.get())

  handle(IpcChannel.HardwarePrintReceipt, {
    schema: z.object({ orderId: z.string().uuid() }),
    permission: 'sales.view',
    handler: (_ctx, input: { orderId: string }) => {
      const orders = services.orders as OrderService
      return hardware.printReceipt(orders.getOrder(input.orderId))
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.HardwareCustomerDisplay, {
    schema: z.object({ open: z.boolean() }).optional(),
    handler: (_ctx, input: { open?: boolean } = {}) => {
      if (input.open !== false) openCustomerDisplay()
      return { open: true }
    }
  }, services, () => sessionStore.get())
}
