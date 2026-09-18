/* Dev utility: screenshot the customers screen as owner. */
import { _electron as electron } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const run = async () => {
  mkdirSync('release/shots', { recursive: true })
  rmSync('/tmp/apex-shot-cust', { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: '/tmp/apex-shot-cust', NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')

  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 15000 })

  await page.click('nav[aria-label="Primary"] a[href$="/customers"]')
  await page.waitForSelector('text=Customers', { timeout: 10000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'release/shots/p7-customers.png', fullPage: true })

  await app.close()
  console.log('Saved screenshots')
}

void run()
