import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp as launch } from './launch'

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

test.describe('Backup & Restore', () => {
  let app: ElectronApplication, page: Page, dataDir: string
  test.beforeAll(async () => {
    app = await launch('backup2')
    // Resolve the actual hermetic data dir from the running app
    const info = await (await app.firstWindow()).evaluate(() => window.api.app.info())
    if (!info.ok) throw new Error('app.info failed')
    dataDir = info.data.dataDir
    page = await login(app)
  })
  test.afterAll(async () => await app.close())

  test('create backup via settings', async () => {
    await page.click('a[href$="/settings"]')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Backup & data")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("New backup")')
    await page.waitForSelector('text=Backup created', { timeout: 15000 })
    await page.screenshot({ path: 'release/shots/e2e-backup-created.png', fullPage: true })
    const backups = existsSync(join(dataDir, 'backups'))
    expect(backups).toBe(true)
  })

  test('list backups shows the created file', async () => {
    await page.reload()
    await page.waitForLoadState('load')
    await page.click('a[href$="/settings"]')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Backup & data")')
    await page.waitForTimeout(500)
    await expect(page.locator('text=MB').first()).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-backup-list.png', fullPage: true })
  })
})

test.describe('Command Palette (Ctrl+K)', () => {
  let app: ElectronApplication, page: Page
  test.beforeAll(async () => {
    app = await launch('palette')
    page = await login(app)
  })
  test.afterAll(async () => await app.close())

  test('opens with Ctrl+K, filters, navigates', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
    await expect(page.locator('text=Command palette')).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-palette-open.png', fullPage: true })

    await page.keyboard.type('kitchen')
    await page.waitForTimeout(200)
    await expect(page.locator('[role="option"]:has-text("Kitchen Display")')).toBeVisible()
    await page.screenshot({ path: 'release/shots/e2e-palette-filtered.png', fullPage: true })

    await page.click('[role="option"]:has-text("Kitchen Display")')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/kitchen/)
    await page.screenshot({ path: 'release/shots/e2e-palette-navigate.png', fullPage: true })
  })

  test('theme toggle via palette', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(200)
    await page.keyboard.type('theme')
    await page.waitForTimeout(200)
    await expect(page.locator('[role="option"]:has-text("Toggle theme")')).toBeVisible()
    await page.click('[role="option"]:has-text("Toggle theme")')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'release/shots/e2e-palette-theme.png', fullPage: true })
  })
})
