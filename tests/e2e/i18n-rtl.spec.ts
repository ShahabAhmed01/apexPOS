import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp, loginAsOwner } from './launch'

test.describe('i18n & RTL', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launchApp('rtl')
    page = await loginAsOwner(app)
  })
  test.afterAll(async () => await app.close())

  test('starts in English on a hermetic profile', async () => {
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr')
    await expect(page.locator('button:has(svg):has-text("English")')).toBeVisible()
  })

  test('switching to Urdu flips document direction and translates the shell; cart survives', async () => {
    // Add an item first so we can prove language switching preserves in-progress state.
    await page.fill('input[aria-label="Search products"]', 'Coca-Cola 500ml')
    await page.waitForSelector('button:has-text("Coca-Cola 500ml")', { timeout: 5000 })
    await page.click('button:has-text("Coca-Cola 500ml")')
    await expect(page.locator('text=Current Sale')).toBeVisible()

    // Switch language via the header selector
    await page.click('button:has(svg):has-text("English")')
    await page.click('[role="menuitem"]:has-text("اردو")')
    await page.waitForTimeout(500)

    // Direction flipped
    const dir = await page.evaluate(() => document.documentElement.dir)
    expect(dir).toBe('rtl')

    // Nav translated (Purchasing = خریداری)
    await expect(page.locator('nav[aria-label="Primary"] a[aria-label="خریداری"]')).toBeVisible()

    // Cart still has the line (state survived language switch)
    await expect(page.locator('text=Coca-Cola 500ml').first()).toBeVisible()

    // Numeric amount stays LTR numerals even in RTL
    const numsDir = await page.evaluate(() => {
      const el = document.querySelector('.nums')
      return el ? getComputedStyle(el).direction : null
    })
    expect(numsDir).toBe('ltr')

    await page.screenshot({ path: 'release/shots/e2e-rtl-pos.png', fullPage: true })

    // RTL workflow: pay by keyboard shortcut
    await page.keyboard.press('F9')
    await expect(page.locator('text=Payment complete')).toBeVisible({ timeout: 10000 })
    await page.click('button:has-text("Done")')

    // Switch back
    await page.click('button:has(svg):has-text("اردو")')
    await page.click('[role="menuitem"]:has-text("English")')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr')
    await expect(page.locator('text=Current Sale')).toBeVisible()
  })
})
