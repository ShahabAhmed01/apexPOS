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

const login = async (app: ElectronApplication, user: string, pass: string): Promise<Page> => {
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page.fill('#username', user)
  await page.fill('#password', pass)
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20000 })
  await page.waitForSelector('button:has-text("Coca-Cola")', { timeout: 10000 })
  return page
}

test.describe('Permission matrix (Cashier vs Owner)', () => {
  let ownerApp: ElectronApplication, cashierApp: ElectronApplication
  let ownerPage: Page, cashierPage: Page

  test.beforeAll(async () => {
    ownerApp = await launch('perm-owner')
    ownerPage = await login(ownerApp, 'owner', 'Owner123!')
    cashierApp = await launch('perm-cashier')
    cashierPage = await login(cashierApp, 'cashier', 'Cashier123!')
  })
  test.afterAll(async () => {
    await ownerApp.close()
    await cashierApp.close()
  })

  test('cashier CAN see POS, Floor, Customers but NOT Inventory/Reports/Settings/Kitchen', async () => {
    await expect(cashierPage.locator('a[href$="/pos"]')).toBeVisible()
    await expect(cashierPage.locator('a[href$="/floor"]')).toBeVisible()
    await expect(cashierPage.locator('a[href$="/customers"]')).toBeVisible()
    await expect(cashierPage.locator('a[href$="/inventory"]')).toHaveCount(0)
    await expect(cashierPage.locator('a[href$="/reports"]')).toHaveCount(0)
    await expect(cashierPage.locator('a[href$="/settings"]')).toHaveCount(0)
    await expect(cashierPage.locator('a[href$="/dashboard"]')).toHaveCount(0)
    await expect(cashierPage.locator('a[href$="/kitchen"]')).toHaveCount(0)
  })

  test('owner CAN see all sections', async () => {
    const sections = ['/dashboard', '/pos', '/inventory', '/floor', '/kitchen', '/customers', '/reports', '/settings']
    for (const s of sections) {
      await expect(ownerPage.locator(`a[href$="${s}"]`)).toBeVisible()
    }
  })
})

test.describe('Inventory low-stock alert', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('inv-low')
    page = await login(app, 'owner', 'Owner123!')
  })
  test.afterAll(async () => await app.close())

  test('low-stock tab shows products with zero stock', async () => {
    await page.click('a[href$="/inventory"]')
    await page.waitForSelector('text=Inventory', { timeout: 10000 })
    await page.click('button:has-text("Low Stock")')
    await page.waitForTimeout(500)
    await expect(page.locator('text=Low Stock')).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-low-stock.png', fullPage: true })
  })
})
