import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const launch = async (suffix: string): Promise<ElectronApplication> => {
  const dir = join('/tmp', `apex-e2e-${suffix}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development', APEXPOS_SEED_DEMO: '1' }
  })
}

const login = async (
  app: ElectronApplication,
  user = 'owner',
  pass = 'Owner123!'
): Promise<Page> => {
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page.fill('#username', user)
  await page.fill('#password', pass)
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20000 })
  await page.waitForSelector('button:has-text("Coca-Cola")', { timeout: 10000 })
  return page
}

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

  test('open table from floor redirects to POS', async () => {
    await page.click('a[href$="/floor"]')
    await page.waitForSelector('text=P-1', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.locator('button:has-text("P-1")').first().click({ force: true })
    await page.waitForTimeout(200)
    await page.click('button:has-text("Seat party")')
    await page.waitForTimeout(1500)

    await expect(page.locator('text=Current Sale')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'release/shots/e2e-dinein-pos.png', fullPage: true })
  })
})
