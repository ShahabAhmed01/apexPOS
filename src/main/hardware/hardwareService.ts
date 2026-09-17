import { renderReceiptText } from './receipt'
import type { Order } from '@shared/types/models'

/**
 * Hardware abstraction layer. Every device supports:
 *  - `simulated` (default): software behavior, visible in the UI / logs
 *  - `real`: adapter stub kept behind an interface so physical drivers can
 *    replace it without touching callers
 *
 * The app works fully with simulators — no physical hardware required.
 */

export type DeviceState = 'ready' | 'error' | 'busy' | 'offline'

export interface PrinterStatus {
  device: 'printer'
  state: DeviceState
  message?: string
  lastJobAt?: string
}

export class HardwareService {
  private printerState_value: PrinterStatus = { device: 'printer', state: 'ready' }
  private drawerOpen = false
  private printLog: { at: string; chars: number; orderId?: string }[] = []

  constructor(
    private onPrintEvent?: (entry: { at: string; chars: number; orderId?: string }) => void
  ) {}

  /** Simulated thermal printer — renders 42-col text, records the job. */
  printReceipt(order: Order): { ok: true; preview: string } {
    const text = renderReceiptText(order)
    this.printerState_value = { device: 'printer', state: 'busy' }
    const entry = { at: new Date().toISOString(), chars: text.length, orderId: order.id }
    this.printLog.push(entry)
    this.onPrintEvent?.(entry)
    this.printerState_value = { device: 'printer', state: 'ready', lastJobAt: entry.at }
    return { ok: true, preview: text }
  }

  /** Cash drawer — in simulation just toggles state; real impl would pulse the printer relay. */
  openDrawer(): { ok: true; state: 'open' } {
    this.drawerOpen = true
    return { ok: true, state: 'open' }
  }

  drawerStatus(): { open: boolean } {
    return { open: this.drawerOpen }
  }

  closeDrawer(): void {
    this.drawerOpen = false
  }

  printerStatus(): PrinterStatus {
    return this.printerState_value
  }

  recentPrintJobs(): { at: string; chars: number; orderId?: string }[] {
    return this.printLog.slice(-50)
  }
}
