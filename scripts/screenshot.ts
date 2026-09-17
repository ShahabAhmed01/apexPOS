/* Dev utility: boot Electron, log in as cashier, exercise POS, screenshot. */
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
  await page.waitForSelector('text=Current Sale', { timeout: 15000 })

  // Wait for the product grid
  await page.waitForSelector('text=Coca-Cola 500ml PET', { timeout: 15000 })
  await page.screenshot({ path: 'release/shots/p0-pos.png', fullPage: true })

  // Click two products to add to cart
  await page.click('text=Coca-Cola 500ml PET')
  await page.click('text=Coca-Cola 500ml PET')
  await page.click('text=Colgate MaxFresh 120g')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'release/shots/p0-pos-cart.png', fullPage: true })

  // Complete a cash sale
  const charge = await page.locator('button:has-text("Charge")').first()
  if (await charge.isVisible().catch(() => false)) {
    await charge.click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: 'release/shots/p0-pos-receipt.png', fullPage: true })
    console.log('checkout attempted')
  }

  console.log('Saved screenshots')
  await app.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
