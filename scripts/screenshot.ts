/* Dev utility: boot Electron, log in as cashier, screenshot the POS screen. */
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'node:fs'

const run = async () => {
  mkdirSync('release/shots', { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: '/tmp/apexpos-e2e', NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')

  // Login
  await page.fill('#username', 'cashier')
  await page.fill('#password', 'Cashier123!')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)

  await page.screenshot({ path: 'release/shots/p0-pos.png', fullPage: true })
  console.log('Saved release/shots/p0-pos.png')

  await app.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
