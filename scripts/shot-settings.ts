/* Dev utility: screenshot the settings screen as owner. */
import { _electron as electron } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const run = async () => {
  mkdirSync('release/shots', { recursive: true })
  rmSync('/tmp/apex-shot-settings', { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: '/tmp/apex-shot-settings', NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')

  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 15000 })

  await page.click('nav[aria-label="Primary"] a[href$="/settings"]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'release/shots/p9-settings-appearance.png', fullPage: true })

  await page.click('text=Backup & data')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'release/shots/p9-settings-backup.png', fullPage: true })

  await app.close()
  console.log('Saved screenshots')
}
void run()
