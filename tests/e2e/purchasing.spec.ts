import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp, loginAsOwner } from './launch'

test.describe('Purchasing flow (E2E)', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launchApp('purchasing')
    page = await loginAsOwner(app)
  })
  test.afterAll(async () => await app.close())

  const seedProduct = 'Coca-Cola 500ml'
  const theSupplier = 'Gourmet Traders'

  test('supplier → PO → send → partial receive → full receive → stock moves', async () => {
    await page.click('a[href$="/purchasing"]')
    await expect(page.locator('h1:has-text("Purchasing")')).toBeVisible({ timeout: 10000 })

    // Create a supplier (Suppliers tab)
    await page.click('[role="tab"]:has-text("Suppliers")')
    await page.click('button:has-text("New supplier")')
    await page.getByLabel('Name', { exact: true }).fill('E2E Supplier Ltd')
    await page.getByLabel('Contact', { exact: true }).fill('Test Person')
    await page.click('button[type=submit]')
    await expect(page.locator('td:has-text("E2E Supplier Ltd")')).toBeVisible({ timeout: 5000 })

    // Back to POs: create a PO against the EXISTING demo supplier
    await page.click('[role="tab"]:has-text("Purchase orders")')
    await page.click('button:has-text("New purchase order")')
    await page.getByLabel('Supplier', { exact: true }).selectOption({ label: theSupplier })
    await page.getByLabel('Search products or scan barcode…').fill(seedProduct)
    await page.waitForSelector(`button:has-text("${seedProduct}")`, { timeout: 5000 })
    await page.click(`button:has-text("${seedProduct}")`)
    const qtyInput = page.getByLabel(/^Qty —/)
    await qtyInput.fill('5')
    await page.getByRole('button', { name: 'Save' }).click()

    // PO visible as draft
    await expect(page.locator(`td:has-text("${theSupplier}")`).first()).toBeVisible({
      timeout: 5000
    })
    await expect(page.locator('span:has-text("Draft")').first()).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-purchasing-draft.png', fullPage: true })

    // Open the PO → send
    await page.click(`tr:has-text("${theSupplier}")`)
    await expect(page.getByRole('heading', { name: /PO #\d+ —/ })).toBeVisible()
    await page.getByRole('button', { name: 'Mark as sent' }).click()
    await page.waitForTimeout(400)

    // Partial receive 2 of 5
    await page.click(`tr:has-text("${theSupplier}")`)
    await page.getByLabel(/^Receive now —/).fill('2')
    await page.getByRole('button', { name: 'Receive stock', exact: false }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('span:has-text("Partially received")').first()).toBeVisible({
      timeout: 5000
    })

    // Receive the remaining 3 → fully received
    await page.click(`tr:has-text("${theSupplier}")`)
    await page.getByLabel(/^Receive now —/).fill('3')
    await page.getByRole('button', { name: 'Receive stock', exact: false }).click()
    await page.waitForTimeout(400)
    await page.click(`tr:has-text("${theSupplier}")`)
    await expect(page.locator('span:has-text("Received")').first()).toBeVisible({ timeout: 5000 })
    // Cancel must NOT be offered once stock moved (service rejects; UI hides it)
    await expect(page.locator('button:has-text("Cancel PO")')).toHaveCount(0)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.screenshot({ path: 'release/shots/e2e-purchasing-received.png', fullPage: true })
  })

  test('cancel a draft PO', async () => {
    await page.click('a[href$="/purchasing"]')
    await page.click('button:has-text("New purchase order")')
    await page.getByLabel('Supplier', { exact: true }).selectOption({ label: theSupplier })
    await page.getByLabel('Search products or scan barcode…').fill('Colgate')
    await page.waitForSelector('button:has-text("Colgate")')
    await page.click('button:has-text("Colgate")')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.click(`tr:has-text("${theSupplier}")`)
    await expect(page.locator('span:has-text("Draft")').first()).toBeVisible()
    await page.getByRole('button', { name: 'Cancel PO' }).click()
    await expect(page.locator('span:has-text("Cancelled")').first()).toBeVisible({ timeout: 5000 })
  })
})
