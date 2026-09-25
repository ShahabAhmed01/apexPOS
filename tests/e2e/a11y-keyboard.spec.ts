import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp, launchAppWithAxe } from './launch'

/**
 * A11Y + keyboard-only operation. Runs real axe-core audits inside the real
 * Electron build (loaded via the APEXPOS_AXE=1 test hook — never shipped in
 * normal boot) and performs one complete sale with zero mouse interaction.
 */

const loginAndAwaitAxe = async (app: ElectronApplication): Promise<Page> => {
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20000 })
  await page.waitForFunction(
    () => Boolean((window as unknown as { __axe?: unknown }).__axe),
    null,
    { timeout: 15000 }
  )
  return page
}

interface AxeViolation {
  id: string
  impact: string
  nodes: unknown[]
}

const auditPage = async (
  page: Page,
  label: string
): Promise<{ screen: string; rule: string; impact: string; nodes: number }[]> => {
  const results = (await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        __axe: { run: (ctx: Document, opts?: unknown) => Promise<{ violations: AxeViolation[] }> }
      }
    ).__axe
    return axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
    })
  })) as { violations: AxeViolation[] }
  const serious = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact))
  return serious.map((v) => ({
    screen: label,
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.length
  }))
}

test.describe('Accessibility (axe-core, WCAG 2 A/AA automatables)', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launchAppWithAxe('a11y')
    page = await loginAndAwaitAxe(app)
  })
  test.afterAll(async () => await app.close())

  test('all primary screens audit clean of critical/serious violations', async () => {
    const findings: { screen: string; rule: string; impact: string; nodes: number }[] = []

    const screens: { name: string; go: () => Promise<void> }[] = [
      { name: 'pos', go: async () => page.click('a[href$="/pos"]') },
      { name: 'inventory', go: async () => page.click('a[href$="/inventory"]') },
      { name: 'purchasing', go: async () => page.click('a[href$="/purchasing"]') },
      { name: 'floor', go: async () => page.click('a[href$="/floor"]') },
      { name: 'kitchen', go: async () => page.click('a[href$="/kitchen"]') },
      { name: 'customers', go: async () => page.click('a[href$="/customers"]') },
      { name: 'reports', go: async () => page.click('a[href$="/reports"]') },
      { name: 'settings', go: async () => page.click('a[href$="/settings"]') },
      { name: 'dashboard', go: async () => page.click('a[href$="/dashboard"]') }
    ]
    for (const s of screens) {
      await s.go()
      await page.waitForTimeout(800) // let queries settle
      findings.push(...(await auditPage(page, s.name)))
    }
    if (findings.length > 0) {
      console.error('AXE-CRITICAL/SERIOUS:', JSON.stringify(findings, null, 2))
    }
    expect(findings).toEqual([])
  })

  test('axe harness sanity: detects a deliberately injected violation', async () => {
    const sanity = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          __axe: { run: (ctx: Document, opts?: unknown) => Promise<{ violations: AxeViolation[] }> }
        }
      ).__axe
      const img = document.createElement('img')
      img.setAttribute('src', 'data:,')
      document.body.appendChild(img)
      try {
        const res = (await axe.run(document)) as { violations: AxeViolation[] }
        return res.violations.some((v) => v.id === 'image-alt')
      } finally {
        img.remove()
      }
    })
    expect(sanity).toBe(true)
  })
})

test.describe('Keyboard-only POS sale', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launchApp('kbd')
    page = await app.firstWindow()
    await page.waitForLoadState('load')
  })
  test.afterAll(async () => await app.close())

  test('login → search → add → pay, keys only (no mouse)', async () => {
    // Login purely by keyboard: username field is autofocused.
    await page.keyboard.type('owner')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Owner123!')
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=Current Sale', { timeout: 20000 })

    // Search field autofocuses (assert it), type a name, Enter adds the top hit.
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    expect(focused).toBe('Search products')
    await page.keyboard.type('Coca-Cola 500ml')
    await page.waitForSelector('button:has-text("Coca-Cola 500ml")', { timeout: 5000 })
    await page.keyboard.press('Enter')
    await expect(page.locator('text=/Charge/')).toBeVisible({ timeout: 5000 })

    // Add a second item via F2 + search, then pay by F9 (Cash).
    await page.keyboard.press('F2')
    await page.keyboard.type('Colgate MaxFresh')
    await page.waitForSelector('button:has-text("Colgate MaxFresh")', { timeout: 5000 })
    await page.keyboard.press('Enter')
    await page.keyboard.press('F9')
    await expect(page.locator('text=Payment complete')).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'release/shots/e2e-keyboard-sale.png', fullPage: true })
  })
})
