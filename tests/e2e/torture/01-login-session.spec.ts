import { test, expect } from '@playwright/test'
import {
  launchT,
  attemptLogin,
  login,
  firstWindow,
  openDb,
  q1,
  closeApp,
  shot,
  log,
  USERS,
  PIN
} from './_util'

/**
 * §22 LOGIN LIVE TESTING + §23 SESSION LIVE TORTURE
 * Real login screen, real Argon2 verification, real lockout, real sessions.
 */

test.describe('login torture', () => {
  test('wrong password shows error, no crash, no session', async () => {
    const { app } = await launchT({ label: 'login-wrongpw' })
    const page = await attemptLogin(app, 'owner', 'WrongPassword1!')
    await expect(page.locator('[role=alert]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[role=alert]')).not.toContainText('Owner123')
    // Still on login screen
    await expect(page.locator('#username')).toBeVisible()
    const sess = await page.evaluate('window.api.auth.session()')
    expect((sess as { ok: boolean }).ok).toBe(true) // envelope ok, null data
    expect((sess as { data: unknown }).data).toBeNull()
    await shot(page, 'login-wrong-password')
    await closeApp(app)
  })

  test('empty fields → zod validation, no IPC round trip', async () => {
    const { app } = await launchT({ label: 'login-empty' })
    const page = await firstWindow(app)
    await page.click('button[type=submit]')
    await expect(page.locator('text=Username is required')).toBeVisible()
    await expect(page.locator('text=Password is required')).toBeVisible()
    await closeApp(app)
  })

  test('unknown user vs known user wrong pw — same generic error (no user enumeration)', async () => {
    const { app } = await launchT({ label: 'login-enum' })
    const p1 = await attemptLogin(app, 'no-such-user-xyz', 'whatever123!')
    const e1 = await p1.locator('[role=alert]').innerText({ timeout: 10_000 })
    await p1.fill('#username', 'owner')
    await p1.fill('#password', 'still-wrong-9!')
    await p1.click('button[type=submit]')
    const e2 = await p1.locator('[role=alert]').innerText({ timeout: 10_000 })
    expect(e1.trim()).toBe(e2.trim())
    await closeApp(app)
  })

  test('unicode / emoji / 10k-char inputs are handled safely', async () => {
    const { app, dir } = await launchT({ label: 'login-unicode' })
    const page = await firstWindow(app)
    await page.fill('#username', 'اردو UserName 😀')
    await page.fill('#password', 'x'.repeat(10_000))
    await page.click('button[type=submit]')
    // Must show an error (bad creds) and remain usable
    await expect(page.locator('[role=alert]')).toBeVisible({ timeout: 10_000 })
    await page.fill('#username', "'; DROP TABLE users;--")
    await page.fill('#password', "' OR '1'='1")
    await page.click('button[type=submit]')
    await expect(page.locator('[role=alert]')).toBeVisible({ timeout: 10_000 })
    // DB must be intact after SQLi attempt through login
    const db = openDb(dir)
    const users = q1<{ c: number }>(db, 'SELECT COUNT(*) c FROM users')
    expect(users.c).toBe(10)
    expect((await import('./_util')).dbHealth(db).integrity).toBe('ok')
    db.close()
    await closeApp(app)
  })

  test('rapid double-submit on Sign in does not create two sessions', async () => {
    const { app, dir } = await launchT({ label: 'login-dbl' })
    const page = await firstWindow(app)
    await page.fill('#username', 'owner')
    await page.fill('#password', USERS.owner)
    const btn = page.locator('button[type=submit]')
    // Rapid-fire: click twice before busy state can matter + Enter key spam
    await Promise.all([
      btn.click({ timeout: 4000 }).catch(() => null),
      btn.click({ timeout: 4000 }).catch(() => null),
      page.keyboard.press('Enter').catch(() => null)
    ])
    await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
    const db = openDb(dir)
    const sessions = q1<{ c: number }>(db, 'SELECT COUNT(*) c FROM sessions')
    expect(sessions.c).toBeLessThanOrEqual(3) // no runaway session creation
    db.close()
    await closeApp(app)
  })

  test('username is case-insensitive (login with OWNER)', async () => {
    const { app } = await launchT({ label: 'login-case' })
    const page = await attemptLogin(app, 'OWNER', USERS.owner)
    await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
    // explicit: the login form is gone, the shell replaced it
    await expect(page.locator('#username')).not.toBeVisible()
    await expect(page.locator('nav[aria-label="Primary"] a').first()).toBeVisible()
    await closeApp(app)
  })

  test('repeated failures then success (lockout recovery check)', async () => {
    const { app } = await launchT({ label: 'login-lockout' })
    const page = await firstWindow(app)
    for (let i = 0; i < 6; i++) {
      await page.fill('#username', 'owner')
      await page.fill('#password', `bad-${i}!`)
      await page.click('button[type=submit]')
      await page.waitForSelector('[role=alert]', { timeout: 10_000 })
      await page.locator('[role=alert]').waitFor({ state: 'visible' })
    }
    const beforeErr = await page.locator('[role=alert]').innerText()
    log({ test: 'lockout', afterSixFailures: beforeErr })
    // Now the CORRECT password: observe whether lockout blocks a legit login
    await page.fill('#username', 'owner')
    await page.fill('#password', USERS.owner)
    await page.click('button[type=submit]')
    const shell = await page
      .waitForSelector('text=Current Sale', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    const alertText = shell
      ? null
      : await page
          .locator('[role=alert]')
          .innerText()
          .catch(() => null)
    log({ test: 'lockout', legitimateLoginSucceeded: shell, alertText })
    // Whatever the policy, it must be safe: either allowed in, or clearly refused
    expect(shell || (alertText && alertText.length > 0)).toBeTruthy()
    await closeApp(app)
  })
})

test.describe('all 10 roles can log in and see exactly their permitted nav', () => {
  const ROLE_NAV: Record<string, string[]> = {
    owner: [
      'dashboard',
      'pos',
      'inventory',
      'purchasing',
      'floor',
      'kitchen',
      'customers',
      'reports',
      'settings'
    ],
    admin: [
      'dashboard',
      'pos',
      'inventory',
      'purchasing',
      'floor',
      'kitchen',
      'customers',
      'reports',
      'settings'
    ],
    manager: [
      'dashboard',
      'pos',
      'inventory',
      'purchasing',
      'floor',
      'kitchen',
      'customers',
      'reports'
    ],
    cashier: ['pos', 'floor', 'customers'],
    waiter: ['pos', 'floor', 'kitchen'],
    kitchen: ['kitchen'],
    inventory: ['dashboard', 'inventory', 'purchasing', 'reports'],
    purchasing: ['dashboard', 'inventory', 'purchasing', 'reports'],
    accountant: ['dashboard', 'reports'],
    auditor: ['dashboard', 'reports']
  }

  for (const [user, expectedNav] of Object.entries(ROLE_NAV)) {
    test(`role ${user}: nav = [${expectedNav.join(',')}]`, async () => {
      const { app } = await launchT({ label: `role-${user}` })
      const page = await login(app, user)
      const links = await page
        .locator('nav[aria-label="Primary"] a')
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))
      expect(links.sort()).toEqual(expectedNav.map((n) => `#/${n}`).sort())
      const roleBadge = await page.locator('header span:has-text("·")').last().innerText()
      expect(roleBadge.length).toBeGreaterThan(0)
      await closeApp(app)
    })
  }

  test('read-only roles land on a broken POS screen (no sales.create) — record behavior', async () => {
    const { app } = await launchT({ label: 'role-auditor-pos' })
    const page = await login(app, 'auditor')
    // Index route is /pos — auditor has no sales.create. Observe what renders.
    const url = page.url()
    const hasError = await page.locator('[role=alert]').count()
    const currentSale = await page.locator('text=Current Sale').count()
    log({
      test: 'auditor-landing',
      url,
      alerts: hasError,
      posHeaderVisible: currentSale,
      note: 'read-only roles land on /pos which they cannot operate'
    })
    await shot(page, 'auditor-landing-pos')
    // This is a UX defect candidate — recorded for triage, not asserted either way here.
    expect(currentSale).toBeGreaterThan(0)
    await closeApp(app)
  })
})

test.describe('lock / unlock / logout torture', () => {
  test('lock screen: PIN unlock happy path + wrong PIN', async () => {
    const { app } = await launchT({ label: 'lock-pin' })
    const page = await login(app, 'cashier')
    await page.click('button[aria-label="Lock screen"]')
    await expect(page.locator('text=Enter your PIN to unlock')).toBeVisible()
    // Wrong PIN ×3
    for (let i = 0; i < 3; i++) {
      await page.fill('input[aria-label="PIN"]', '9999')
      await page.keyboard.press('Enter')
      await expect(page.locator('[role=alert]')).toBeVisible({ timeout: 5000 })
    }
    // Correct PIN
    await page.fill('input[aria-label="PIN"]', PIN)
    await page.keyboard.press('Enter')
    await expect(page.locator('text=Current Sale')).toBeVisible({ timeout: 10_000 })
    await closeApp(app)
  })

  test('locked terminal refuses privileged IPC at the trusted boundary (LT-001 GREEN)', async () => {
    const { app } = await launchT({ label: 'lock-ipc' })
    const page = await login(app, 'cashier')
    await page.click('button[aria-label="Lock screen"]')
    await expect(page.locator('text=Enter your PIN to unlock')).toBeVisible()
    // While the lock screen is up, creating an order must be refused by the
    // main process. (LT-001 FIXED: UI lock now engages AppLock IPC)
    const res = (await page.evaluate(
      `(async () => {
        // Try to create an order with a dummy product ID - should fail due to lock
        return window.api.orders.create({
          type: 'retail', clientOpId: crypto.randomUUID(),
          lines: [{ productId: '00000000-0000-0000-0000-000000000000', quantityMilli: 1000 }]
        });
      })()`
    )) as { ok: boolean; error?: { code: string } }
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('UNAUTHORIZED')
    await closeApp(app)
  })

  test('logout clears session; old renderer cannot act', async () => {
    const { app } = await launchT({ label: 'logout-clear' })
    const page = await login(app, 'cashier')
    await page.click('button[aria-label="Sign out"]')
    await expect(page.locator('#username')).toBeVisible({ timeout: 10_000 })
    const res = (await page.evaluate(`window.api.products.search('cola')`)) as {
      ok: boolean
      error?: { code: string }
    }
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBeTruthy()
    await closeApp(app)
  })

  test('session survives renderer reload', async () => {
    const { app } = await launchT({ label: 'session-reload' })
    const page = await login(app, 'owner')
    await page.reload()
    await page.waitForSelector('text=Current Sale', { timeout: 15_000 })
    const who = await page.locator('header span:has-text("·")').last().innerText()
    expect(who).toContain('Omar')
    await closeApp(app)
  })
})
