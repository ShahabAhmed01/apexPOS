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
  `PKR ${(minor / 100).toLocaleString('en-PK', { minimumFractionDigits: 0 })}`

export const renderReceiptText = (
  order: Order,
  footer = 'Thank you for shopping with us!'
): string => {
  const out: string[] = []
  out.push(divider('='))
  out.push('APEXPOS DEMO STORE')
  out.push('Plot 14, Clifton Block 5, Karachi')
  out.push('Ph: 021-35820001')
  out.push(divider('='))
  out.push(line(`Receipt: ${order.numberLabel}`, new Date(order.createdAt).toLocaleString()))
  out.push(line(`Cashier: ${order.userName}`, `Terminal: ${order.terminalId}`))
  out.push(divider())

  for (const l of order.lines) {
    out.push(l.name.slice(0, WIDTH))
    if (l.modifiers.length > 0) {
      for (const m of l.modifiers) out.push(`  + ${m.name}`)
    }
    if (l.notes) out.push(`  NOTE: ${l.notes}`)
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
