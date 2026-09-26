import { test, expect } from '@playwright/test'
import { launchT, login, closeApp, log } from './_util'

/**
 * PROBE: does the UI lock button engage the main-process session gate?
 * AppShell calls zustand lock() only — AppLock IPC may never be invoked.
 */
test('probe: UI lock leaves main-process session alive', async () => {
  const { app } = await launchT({ label: 'probe-lock' })
  const page = await login(app, 'cashier')
  await page.click('button[aria-label="Lock screen"]')
  await expect(page.locator('text=Enter your PIN to unlock')).toBeVisible()

  type ProbeRes = { ok: boolean; error?: { code: string; message: string } }
  const results = (await page.evaluate(`(async () => {
    const search = await window.api.products.search('cola')
    const adjust = await window.api.customers.adjustLoyalty('00000000-0000-0000-0000-000000000000', 10, 'x')
    const prod = await window.api.products.search('coca')
    const tender = prod.ok && prod.data?.[0] ? await window.api.orders.create({
      type: 'retail', clientOpId: crypto.randomUUID(),
      lines: [{ productId: prod.data[0].id, quantityMilli: 1000 }]
    }) : { ok: false, error: { code: 'NO_PRODUCT' } }
    return { search, adjust, tender }
  })()`)) as { search: ProbeRes; adjust: ProbeRes; tender: ProbeRes }

  log({
    test: 'probe-uilock',
    searchWhileLocked: { ok: results.search.ok, err: results.search.error?.code },
    adjustLoyaltyWhileLocked: { ok: results.adjust.ok, err: results.adjust.error?.code },
    createOrderWhileLocked: { ok: results.tender.ok, err: results.tender.error?.code }
  })
  console.log('PROBE RESULTS:', JSON.stringify(results, null, 2))

  // Regardless of triage: while the lock screen is up, NO mutation should pass
  expect(results.tender.ok).toBe(false)
  expect(results.adjust.ok).toBe(false)
  await closeApp(app)
})
