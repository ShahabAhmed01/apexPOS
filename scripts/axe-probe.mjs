import { _electron as electron } from '@playwright/test'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('/tmp', `apex-axe-probe-${process.pid}`)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const app = await electron.launch({
  args: ['.', `--user-data-dir=${join(dir, 'user-data')}`],
  env: {
    ...process.env,
    APEXPOS_DATA_DIR: dir,
    NODE_ENV: 'development',
    APEXPOS_SEED_DEMO: '1',
    APEXPOS_AXE: '1'
  }
})
const page = await app.firstWindow()
await page.waitForLoadState('load')
await page.fill('#username', 'owner')
await page.fill('#password', 'Owner123!')
await page.click('button[type=submit]')
await page.waitForSelector('text=Current Sale', { timeout: 20000 })
await page.waitForFunction(() => Boolean(window.__axe), null, { timeout: 15000 })

for (const [name, hash] of [
  ['pos', '/pos'],
  ['inventory', '/inventory'],
  ['purchasing', '/purchasing'],
  ['customers', '/customers'],
  ['settings', '/settings'],
  ['dashboard', '/dashboard'],
  ['floor', '/floor'],
  ['kitchen', '/kitchen'],
  ['reports', '/reports']
]) {
  await page.click(`a[href$="${hash}"]`)
  await page.waitForTimeout(900)
  const res = await page.evaluate(async () => {
    const axe = window.__axe
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return r.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact))
      .map((v) => ({
        rule: v.id,
        impact: v.impact,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          target: n.target,
          html: (n.html || '').slice(0, 120),
          summary: (n.failureSummary || '').split('\n')[1] ?? ''
        }))
      }))
  })
  if (res.length) console.log(`\n=== ${name} ===`)
  for (const v of res) {
    console.log(` [${v.impact}] ${v.rule}`)
    for (const n of v.nodes) console.log('   -', n.target[0], '|', n.summary)
  }
}
await app.close()
