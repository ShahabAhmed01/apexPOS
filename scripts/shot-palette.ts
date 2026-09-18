/* Dev utility: open command palette and screenshot it. */
import { _electron as electron } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const run = async () => {
  mkdirSync('release/shots', { recursive: true })
  rmSync('/tmp/apex-shot-palette', { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: '/tmp/apex-shot-palette', NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')

  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 15000 })

  await page.keyboard.press('Control+k')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'release/shots/p10-palette.png', fullPage: true })

  await page.keyboard.type('kitchen')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'release/shots/p10-palette-filtered.png', fullPage: true })

  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'release/shots/p10-kitchen-after-palette.png', fullPage: true })

  await app.close()
  console.log('Saved screenshots')
}
void run()
