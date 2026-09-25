import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp as launch, loginAsOwner as login } from './launch'

const addToCart = async (page: Page, productName: string, qty = 1): Promise<void> => {
  for (let i = 0; i < qty; i++) {
    await page.click(`button:has-text("${productName}")`)
    await page.waitForTimeout(100)
  }
}

test.describe('Retail sale flow', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('sale')
    page = await login(app)
  })
  test.afterAll(async () => await app.close())

  test('complete cash sale and print receipt', async () => {
    await addToCart(page, 'Coca-Cola 500ml PET', 2)
    await addToCart(page, 'Colgate MaxFresh 120g', 1)

    await expect(page.locator('text=Subtotal')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=/^Total$/')).toBeVisible({ timeout: 5000 })

    await page.click('button:has-text("Cash")')
    await page.waitForSelector('text=ORD-', { timeout: 10000 })
    await expect(page.locator('text=ORD-')).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-receipt.png', fullPage: true })
  })
})

test.describe('Dine-in flow with floor plan', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('dinein')
    page = await login(app)
  })
  test.afterAll(async () => await app.close())

  test('seat → add items → pay → table frees up (full dine-in loop)', async () => {
    await page.click('a[href$="/floor"]')
    await page.waitForSelector('text=P-1', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.locator('button:has-text("P-1")').first().click({ force: true })
    await page.waitForTimeout(300)
    await page.click('button:has-text("Seat party")')

    // POS opens WITH the table's active order loaded (was previously dropped).
    await expect(page.locator('text=Current Sale')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('text=/Dine-in — table order/')).toBeVisible({ timeout: 8000 })

    await page.fill('input[aria-label="Search products"]', 'Coca-Cola 500ml')
    await page.waitForSelector('button:has-text("Coca-Cola 500ml")', { timeout: 5000 })
    await page.click('button:has-text("Coca-Cola 500ml")')
    await page.keyboard.press('F9')
    // Dine-in orders carry the table label (T-…), receipt header differs
    await expect(page.locator('text=Payment complete')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/T-[A-Z0-9]+-/')).toBeVisible({ timeout: 5000 })

    // Back to the floor: the table is free again (payment completed the order).
    await page.click('button:has-text("Done")')
    await page.click('a[href$="/floor"]')
    await page.waitForTimeout(1200)
    await expect(page.locator('button:has-text("P-1")').first()).toContainText(/free/i, {
      timeout: 8000
    })
    await page.screenshot({ path: 'release/shots/e2e-dinein-pos.png', fullPage: true })
  })
})
