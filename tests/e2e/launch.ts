import { _electron as electron, type Page, type ElectronApplication } from '@playwright/test'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Hermetic Electron launch: a fresh data dir (DB/backups) AND a fresh
 * Chromium user-data dir (localStorage, cookies) per invocation — runs must
 * never leak state into each other, including UI language selections.
 */
export const launchApp = async (suffix: string): Promise<ElectronApplication> => {
  const dir = join('/tmp', `apex-e2e-${suffix}-${process.pid}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return await electron.launch({
    args: ['.', `--user-data-dir=${join(dir, 'user-data')}`],
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development', APEXPOS_SEED_DEMO: '1' }
  })
}

/** Same, with the axe-core test hook enabled. */
export const launchAppWithAxe = async (suffix: string): Promise<ElectronApplication> => {
  const dir = join('/tmp', `apex-e2e-${suffix}-${process.pid}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return await electron.launch({
    args: ['.', `--user-data-dir=${join(dir, 'user-data')}`],
    env: {
      ...process.env,
      APEXPOS_DATA_DIR: dir,
      NODE_ENV: 'development',
      APEXPOS_SEED_DEMO: '1',
      APEXPOS_AXE: '1'
    }
  })
}

export const loginAsOwner = async (app: ElectronApplication): Promise<Page> => {
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20000 })
  await page.waitForSelector('button:has-text("Coca-Cola")', { timeout: 10000 })
  return page
}
