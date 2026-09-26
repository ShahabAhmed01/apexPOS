# RECON — Phase 2 completion cycle (fresh session)

Run: 2026-09-23 · Baseline commit: `25bd351` · Environment: Linux 7.2.4 (CachyOS x86_64),
Node 22.23.2, Electron 44.4.1, better-sqlite3 13, Vitest 5.0.1, Playwright 1.63.0,
real display (no xvfb).

## Method

This session started with ZERO trust in the prior audit's claims: every "passed" was
re-verified, then the work was extended to the missing surfaces the prior cycle could not
finish. See git log + `git diff` for every change; this file is the narrative.

## Baseline gates @25bd351 (before this cycle)

| Gate                            | Recorded result                                                             |
| ------------------------------- | --------------------------------------------------------------------------- |
| format:check / lint / typecheck | PASS                                                                        |
| `npm test`                      | **74/74**                                                                   |
| E2E (`playwright test`)         | **11/11**                                                                   |
| `npm run build` / `package:dir` | PASS                                                                        |
| `npm audit`                     | 0 vulnerabilities (verified twice; first call was a transient registry 5xx) |

## Verified true, from previous cycle (spot-checked against code)

- Shared pricing engine (`src/shared/lib/pricing.ts`) is authoritative; renderer preview uses
  the same pure function. ✔
- Refund settlement (cash / store_credit / original gift-card) correct, partials tracked by
  `payments.refunded_amount`, over-refund rejected. ✔
- Override PIN rate-limit + audit on failure. ✔
- Backup path-traversal blocked. ✔ (Strengthened further — see REPORT §defects.)
- Branch scoping on orders/POs. ✔ (Strengthened further — registers/shifts and restaurant.)

## Found & fixed THIS cycle (each with a failing-then-passing test)

| #    | Defect                                                                                                                       | Impact                                                                                                     | Proof                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D-15 | `RestaurantService.openTable` SQL placeholder mismatch — seating a table threw `Too few parameter values` _always_           | Dine-in was silently broken end-to-end (the old E2E clicked "Seat party" and ignored the failing response) | `restaurant.test.ts` RST-01                                                                                                         |
| D-16 | `openTable` produced the label `'T-XXXX'` without an order number — all table orders shared a label                          | Receipts unreadable                                                                                        | RST-01 (label asserted as `T-XXXX-0001`)                                                                                            |
| D-17 | `closeTable` marked an unpaid table order `completed` — payment bypass                                                       | Completed order with zero payments + no stock removed                                                      | RST-02 rejects; empty orders are voided                                                                                             |
| D-18 | `RegisterService.close` / IPC register close + cash-movement queries were not branch-scoped                                  | A terminal in branch B could close branch A's shift                                                        | `multibranch.test.ts` MB-03 (fails without the guard — proven by deletion)                                                          |
| D-19 | `Refunds` inserted stock movements for _untracked_ products                                                                  | Phantom stock for services; refund ledger never balanced                                                   | capstone invariant `Σmovements = stock` (was −1000 off)                                                                             |
| D-20 | `expectedCash` subtracted `change_amount` and excluded refunded-fully cash payments, double-deducting cash refunds           | Shift expected cash was wrong whenever change was given or a cash sale was fully refunded                  | capstone EOD close (asserted ₨50.00 known variance)                                                                                 |
| D-21 | Purchasing had a complete backend+IPC but **no UI** (anti-slop)                                                              | Feature absent end-to-end                                                                                  | new `PurchasingScreen` + `purchasing.spec.ts` E2E                                                                                   |
| D-22 | `inventory:adjust` was dead IPC surface (preload declared, no handler/service/UI)                                            | Permission `inventory.adjust` signaled a capability that didn't exist                                      | service + IPC + UI + tests                                                                                                          |
| D-23 | i18n nav labels were hardcoded English in `AppShell` / `CommandPalette`                                                      | RTL test could not verify translated nav                                                                   | translated via `nav.*` keys                                                                                                         |
| D-24 | Language switcher menu used imperative `classList.toggle('hidden')` — React re-renders (1 s clock) closed it mid-interaction | Flaky, race-prone UI                                                                                       | replaced with state-driven render + `aria-expanded`                                                                                 |
| D-25 | `Select` used a wrapping implicit label so the accessible name included every option text                                    | Broke `getByLabel` in tests; noisy screen readers                                                          | htmlFor association fixed                                                                                                           |
| D-26 | Floor panel had 4 dead buttons (View/Split bill/Transfer/Merge/Request bill)                                                 | Anti-slop violations; features missing                                                                     | wired to real IPC: `tables.transfer                                                                                                 | requestBill | moveLines | merge` |
| D-27 | POS advertiseed F9/F10/F11/F2 shortcuts but never bound keys                                                                 | Dead affordance                                                                                            | real bindings; keyboard-only sale E2E passes with zero clicks                                                                       |
| D-28 | E2E harness shared Chromium `userData` across runs — localStorage (language) leaked between suites                           | Non-hermetic tests = false confidence                                                                      | `tests/e2e/launch.ts` per-invocation `--user-data-dir`                                                                              |
| D-29 | `products.list` N+1 per product (`onHand` per row) — acceptable at 500 rows; measured and documented, not silently hidden    | 67 ms/p50 @ 10k products page-500                                                                          | perf harness                                                                                                                        |
| D-30 | axe: 68 white-on-`#5b8cff` + muted-text contrast violations (WCAG AA), 2 non-focusable scroll regions                        | Real a11y failure                                                                                          | tokens fixed (`--color-text-2 #8492a6`, `--color-accent-solid #2563eb`), scroll regions focusable; audit now **0 critical/serious** |
| D-31 | `~/.cache/electron` was created INSIDE the repo (electron-builder never expands `~`)                                         | 118 MB artefact ready to commit accidentally                                                               | removed from config + deleted                                                                                                       |
| D-32 | Standard onboarding "restart required" state was not documented anywhere; demo PINs unflagged in docs for packaged flows     | Dangerous on real installs                                                                                 | DOCUMENTED in DEPLOYMENT.md                                                                                                         |

## Known-remaining limits (not defects — scope honesty)

- Physical ESC/POS printers, drawers, scales, scanners: simulated/adapted interfaces only;
  no physical hardware present in this environment.
- Cloud sync transport: deliberately absent (`OFFLINE_SYNC.md`); local outbox is the
  transport-independent half and it is tested as such.
- Windows NSIS / macOS DMG: configured; runtime-test requires their native hosts.
- axe audit = automatable WCAG A/AA rules. Manual checks (focus trapping, focus restoration,
  reduced motion, screen-reader journeys) are documented as performed-by-code but not externally
  certified.

---

# RECON — live torture cycle `run-20260926-1415` (2026-09-26 → 2026-09-27)

Baseline commit: **`ab76626`** (unchanged at the end of this cycle — nothing committed).

## Method

Same zero-trust rule as the previous cycle: every prior "pass" was re-derived, then the app was
attacked from the real UI. Five things were established that the previous recon could not see,
because they only manifest in a **live multi-instance Electron** run:

1. **The channel enum is not the API.** `IpcChannel.OrdersFireCourse`, `OrdersItemStatus` and
   `KitchenRecall` were declared in the enum _and_ typed in `PosApi` _and_ documented — with no
   handler, no preload binding and no UI control (LT-008). `DEF-022` had already taught this
   lesson for 26 channels; the same class of bug survived in the restaurant surface. A
   "declared + typed" channel must be probed by **calling it from the UI**, not by grepping.
2. **Permission gates can be over-privileged and errors silently swallowed at the same time.**
   `TablesOpen` required `tables.manage` (waiters lack it) _and_ `FloorScreen` discarded the
   rejected promise, then navigated anyway — so a waiter's seat attempt failed **invisibly**
   (LT-009). Checking only the permission table would have missed the silent half.
3. **Seeded layout data can make real UI unreachable.** Patio tables P-1/P-2 were seeded at
   `(60,60)/(200,60)`, directly under hall tables T-1/T-2 at `(40,40)/(180,40)`. Hall tiles render
   later and paint over them, so ~56 % of P-1 was unclickable — and `sale-flow.spec.ts:45` had
   been hiding it with `click({ force: true })` (LT-011). **A `force: true` on a click is a
   standing red flag: it is exactly how a geometric defect survives every previous cycle.**
4. **Migration-safe FSM edges can be missing.** `served → sent_to_kitchen` (recall) had to be
   added to the transition map for KDS recall to be legal (LT-008).
5. **Playwright's action timeout defaults to 0 (wait forever).** An app that is slow to paint can
   hang `page.fill()` with no diagnostic and burn an entire test budget anonymously. This plus
   `ElectronApplication.close()` having **no timeout option** are the two harness primitives that
   turned a 30-second slow quit into a fake "test timeout" (LT-013). Both are now explicitly
   bounded and stage-logged.

## What the baseline looked like, and what it became

|                         | Baseline (Phase 1) | Final                                                                    |
| ----------------------- | ------------------ | ------------------------------------------------------------------------ |
| Torture campaign        | **33 / 51**        | **53 / 53** (×6 consecutive)                                             |
| Release E2E             | 18 / 18            | **18 / 18**                                                              |
| Vitest                  | 175 / 175          | **175 / 175**                                                            |
| `typecheck`             | —                  | **0 errors** (was 42 mid-cycle, incl. a real typing bug in LT-004's fix) |
| `lint` / `format:check` | —                  | **0 problems / PASS**                                                    |
| Open defects            | 12 new             | **1 open (LT-013)**, 13 closed                                           |

## Files touched (source — released as v0.2.2)

`registerRestaurant.ts`, `restaurantService.ts`, `registerOrders.ts`, `orderService.ts`,
`productService.ts`, `seed.ts`, `preload/index.ts`, `shared/ipc/api.ts`, `PosScreen.tsx`,
`FloorScreen.tsx`, `AppShell.tsx`, `playwright.config.ts` + new `playwright.torture.config.ts`
and `tests/e2e/torture/` (4 specs, 53 tests, 3 shutdown probes).

## Next recon target

- **LT-013 soak.** The long tail (17 / 503 closes > 5 s, 4 > 30 s — the 4th seen during the
  v0.2.2 verification run) never reproduces outside the
  campaign. Run the shutdown probes under sustained parallel load with `strace`/`pidstat` to see
  whether the main process is blocked inside `db.close()` (WAL checkpoint) or the driver is
  waiting on process exit.
- Audit the rest of the seed data for **geometric / uniqueness collisions** the way LT-011 was
  found (overlap, duplicate names, duplicate barcodes) — the pattern is likely to repeat.
- Audit every remaining `click({ force: true })` in the release suite for what it is hiding.
