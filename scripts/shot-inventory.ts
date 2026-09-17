import { _electron as electron } from 'playwright'
import { mkdirSync } from 'node:fs'

const run = async (): Promise<void> => {
  mkdirSync('release/shots', { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, APEXPOS_DATA_DIR: '/tmp/apexpos-e2e-2', NODE_ENV: 'development' }
  })
  const page = await app.firstWindow()
  await page.fill('#username', 'manager')
  await page.fill('#password', 'Manager123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=APEXPOS', { timeout: 15000 })
  await page.click('a[href="#/inventory"]')
  await page.waitForSelector('text=Coca-Cola 500ml PET', { timeout: 15000 })
  await page.screenshot({ path: 'release/shots/p5-inventory.png', fullPage: true })
  console.log('saved p5-inventory.png')
  await app.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
