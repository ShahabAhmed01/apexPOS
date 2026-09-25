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
