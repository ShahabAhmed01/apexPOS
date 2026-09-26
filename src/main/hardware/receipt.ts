import type { Order } from '@shared/types/models'

/**
 * Receipt renderer. Produces a monospace 42-column receipt (80mm) as plain
 * text for the virtual printer, plus ESC/POS command bytes for real printers.
 */

const WIDTH = 42

const line = (left: string, right = ''): string => {
  const gap = WIDTH - left.length - right.length
  return gap > 0 ? `${left}${' '.repeat(gap)}${right}` : `${left} ${right}`.slice(0, WIDTH)
}

const divider = (ch = '-'): string => ch.repeat(WIDTH)

const fmt = (minor: number): string =>
  `PKR ${(minor / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`

/** Single-line-ify free text: receipts must not be forgeable via embedded newlines. */
const sanitize = (s: string): string => s.replace(/[\r\n]+/g, ' · ').slice(0, 200)

export interface ReceiptBusiness {
  name?: string
  legalName?: string
  address?: string
  phone?: string
  taxId?: string
}

export const renderReceiptText = (
  order: Order,
  opts: { footer?: string; business?: ReceiptBusiness } = {}
): string => {
  const { footer = 'Thank you for shopping with us!', business } = opts
  const out: string[] = []
  out.push(divider('='))
  out.push(sanitize(business?.name?.trim() || 'APEXPOS').toUpperCase())
  if (business?.address) out.push(sanitize(business.address))
  if (business?.phone) out.push(`Ph: ${sanitize(business.phone)}`)
  if (business?.taxId) out.push(`Tax ID: ${sanitize(business.taxId)}`)
  out.push(divider('='))
  out.push(line(`Receipt: ${order.numberLabel}`, new Date(order.createdAt).toLocaleString()))
  out.push(line(`Cashier: ${order.userName}`, `Terminal: ${order.terminalId}`))
  if (order.customerName) out.push(line(`Customer: ${sanitize(order.customerName)}`))
  out.push(divider())

  for (const l of order.lines) {
    out.push(sanitize(l.name).slice(0, WIDTH))
    if (l.modifiers.length > 0) {
      for (const m of l.modifiers) out.push(`  + ${sanitize(m.name)}`)
    }
    if (l.notes) out.push(`  NOTE: ${sanitize(l.notes)}`)
    out.push(
      line(
        `  ${(l.quantity / 1000).toString().replace(/\.?0+$/, '')} x ${fmt(l.unitPrice)}`,
        fmt(l.lineTotal)
      )
    )
  }

  out.push(divider())
  out.push(line('Subtotal', fmt(order.subtotal)))
  if (order.discountTotal > 0) out.push(line('Discount', `-${fmt(order.discountTotal)}`))
  out.push(line('Tax', fmt(order.taxTotal)))
  out.push(divider('='))
  out.push(line('TOTAL', fmt(order.total)))
  if (order.amountPaid > 0) out.push(line('Paid', fmt(order.amountPaid)))
  if (order.changeGiven > 0) out.push(line('Change', fmt(order.changeGiven)))
  out.push(divider('='))
  out.push('')
  out.push(footer)
  out.push('')
  return out.join('\n')
}

/**
 * ESC/POS bytes for real printers: plain ASCII + command escapes.
 * (ESC @ init, GS V partial cut at end.)
 */
export const receiptToEscPos = (text: string): Uint8Array => {
  const esc = 0x1b
  const gs = 0x1d
  const bytes: number[] = [esc, 0x40] // ESC @ init
  for (const ch of text) bytes.push(ch.charCodeAt(0) & 0x7f)
  bytes.push(0x0a, 0x0a, 0x0a, gs, 0x56, 0x41, 0x03) // feed + partial cut
  return new Uint8Array(bytes)
}
