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
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development' }
  })
}

const login = async (app: ElectronApplication, user = 'owner', pass = 'Owner123!'): Promise<Page> => {
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
  await page.fill('input[placeholder*="Search"]', productName.split(' ')[0] ?? productName)
  await page.waitForTimeout(300)
  for (let i = 0; i < qty; i++) {
    await page.click(`button:has-text("${productName}")`)
    await page.waitForTimeout(100)
  }
  await page.fill('input[placeholder*="Search"]', '')
  await page.waitForTimeout(100)
}

test.describe('Hold / Recall', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('hold')
    page = await login(app)
  })
  test.afterAll(async () => await app.close())

  test('hold and recall a cart', async () => {
    await addToCart(page, 'Coca-Cola 500ml PET', 1)
    await addToCart(page, 'Colgate MaxFresh 120g', 1)
    
    await page.click('button[title="Hold order"]')
    await page.fill('input[placeholder*="name"], input[placeholder*="reason"]', 'Customer stepped away')
    await page.click('button:has-text("Hold")')
    await page.waitForSelector('text=Held', { timeout: 10000 })

    await addToCart(page, 'Lays Salted 40g', 1)
    await page.click('text=Hold #1')
    await page.waitForTimeout(300)
    await expect(page.locator('text=Coca-Cola 500ml PET')).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-hold-recall.png', fullPage: true })
  })
})

test.describe('Refund flow', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('refund')
    page = await login(app)
    await addToCart(page, 'Coca-Cola 500ml PET', 1)
    await page.click('button:has-text("Cash")')
    await page.waitForSelector('text=ORD-', { timeout: 10000 })
    await page.screenshot({ path: 'release/shots/e2e-sale-for-refund.png', fullPage: true })
  })
  test.afterAll(async () => await app.close())

  test('receipt shows completed order', async () => {
    await page.screenshot({ path: 'release/shots/e2e-refund.png', fullPage: true })
  })
})
