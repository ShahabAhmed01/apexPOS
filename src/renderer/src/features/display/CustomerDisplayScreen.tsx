import { useEffect, useState } from 'react'
import { qty } from '@shared/lib/quantity'

interface CartUpdate {
  lines: { name: string; quantityMilli: number; unitPrice: number; total: number }[]
  subtotal: number
  tax: number
  total: number
  status: 'shopping' | 'payment' | 'thankyou' | 'idle'
}

const FMT = (m: number): string =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0
  }).format(m / 100)

/** Customer-facing display: shows the current sale in real time. */
export const CustomerDisplayScreen = (): React.ReactElement => {
  const [cart, setCart] = useState<CartUpdate>({
    lines: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    status: 'idle'
  })

  useEffect(() => {
    const unsub = window.api.events.on('customer:update', (payload) => {
      setCart(payload as CartUpdate)
    })
    return unsub
  }, [])

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-0)] text-[var(--color-text-0)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-1)] px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">APEXPOS</h1>
          <p className="text-sm text-[var(--color-text-1)]">Customer display</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-8">
        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-6xl font-bold text-[var(--color-accent)]">Welcome</p>
            <p className="mt-4 text-xl text-[var(--color-text-1)]">Scan items to see them here</p>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-3 overflow-auto">
              {cart.lines.map((l, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-6 border-b border-[var(--color-border)] pb-2"
                >
                  <span className="text-2xl">{l.name}</span>
                  <span className="nums text-right text-2xl">
                    {qty.format(l.quantityMilli)} × {FMT(l.unitPrice)} = {FMT(l.total)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-1 border-t-2 border-[var(--color-border)] pt-4 text-right">
              <p className="text-lg text-[var(--color-text-1)]">
                Subtotal: <span className="nums">{FMT(cart.subtotal)}</span>
              </p>
              <p className="text-lg text-[var(--color-text-1)]">
                Tax: <span className="nums">{FMT(cart.tax)}</span>
              </p>
              <p className="mt-2 text-4xl font-bold text-[var(--color-accent)]">
                Total: <span className="nums">{FMT(cart.total)}</span>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
