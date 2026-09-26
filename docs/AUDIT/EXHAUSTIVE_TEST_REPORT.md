# APEXPOS — Exhaustive Adversarial Verification Report

- **Run ID:** `run-20260925-181543`
- **Commit:** `25ca8c6a8a993dd2579f1eef22f8d6338f7a1ae4` (branch `main`, clean at session start)
- **Environment:** Linux (x86_64), Node v22.23.2, npm 10.9.8, Electron 44.4.1, better-sqlite3 (SQLite 3.53.4), Playwright + Xvfb for E2E
- **Artifacts:** `artifacts/run-20260925-181543/` (`inventory/`, `results/results.json`, `results/coverage-matrix.json`, `results/baseline-*.log`, `results/e2e-baseline.log`, `results/package-dir.log`, `critical/run{1..3}-*.log`, `defects/defects.json`)

> Mindset: falsification. The prior "all green" state was treated as unverified. Every claim below
> was re-derived from this repository at this commit, then attacked.

---

## 1. What was actually exercised

| Layer                       | How                                                                                                                                                                                                                                                                                                     | Evidence                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Static gates                | `prettier --check`, `eslint`, `tsc ×3` (node/web/tests)                                                                                                                                                                                                                                                 | baseline-static.log — all pass after fixes                          |
| Unit/integration            | `vitest` — **24 files, 175 tests** in REAL SQLite (file-backed, WAL, FK on). Includes pre-existing money/pricing/quantity unit suites, sale-flow, payments-edge, restaurant, purchasing, customers, multibranch, onboarding, reports, settings, sync, security-edge, perf, capstone, chaos, concurrency | 3 consecutive green runs                                            |
| New adversarial integration | `adversarial-money` (21), `adversarial-security` (10), `adversarial-ipc` (11), `adversarial-concurrency` (3) — all written RED-first against this codebase; every fix is regression-locked by them                                                                                                      | tests/integration/adversarial-*.test.ts                             |
| Fuzz / property             | ~205,000 deterministic cases (LCG seed `0xC0FFEE`): money parse/format round-trips incl. half-cent boundaries, add/sub group laws, exact split/allocate closure, bps oracle equality, full priceOrder invariant sweep                                                                                   | tests/unit/money-fuzz.test.ts                                       |
| IPC adversarial             | REAL `handle()` registry with mocked-Electron transport: every registered channel fuzzed with 14 malicious payload classes (null/huge strings/NaN/`__proto__`/SQLi/XSS/traversal/nested-nulls), unauthenticated and low-privilege sessions, lock-gate probe, targeted money attacks, dead-channel guard | tests/integration/adversarial-ipc.test.ts (11 tests, ~1,144 probes) |
| Concurrency                 | Existing RACE-001…011 (incl. 4-process gift-card race) + new: duplicate clientOpId raced across two SQLite connections inside a commit window (create + tender), 4-process table-open race                                                                                                              | adversarial-concurrency.test.ts                                     |
| Chaos / crash               | Pre-existing CHAOS-01…06 (fault injection inside tender/refund/PO-receive transactions, mid-flight restart, corrupt/foreign backup rejection, migration idempotency, backup→mutate→restore roundtrip with `integrity_check` + `foreign_key_check`)                                                      | all green ×3                                                        |
| E2E (real Electron)         | sale flow + receipt, dine-in loop, hold/recall, refund, purchasing lifecycle, permission matrix (cashier vs owner), low-stock, backup+pseudo-restore, command palette, i18n/RTL, axe keyboard scans                                                                                                     | 18/18 ×3 under Xvfb; traces retained on failure                     |
| Packaged binary             | `electron-builder --dir` (Linux unpacked, 401 MB) built from this commit; cold-booted with playwright `_electron` against a clean data dir; demo seed sale completed; `integrity_check=ok`, `foreign_key_check=0`, WAL confirmed; startup 708 ms first-paint / 855 ms interactive                       | package-dir.log, packaged-smoke output                              |
| Dependencies                | `npm audit` → 0 vulnerabilities; lockfile present; note: electron-builder reported duplicate hoisted versions of react/@types/react/debug (dev-side, not shipped runtime risk)                                                                                                                          | package-dir.log                                                     |

## 2. Defects found and fixed (24)

All defects reproduced RED first. Full record: `defects/defects.json`. Severities: CRITICAL/HIGH/MEDIUM/LOW.

**Financial (money correctness):**

- DEF-004 (CRITICAL) cart % discounts unbounded → negative order totals / INTERNAL crash on non-integer bps. Fixed at pricing-engine + IPC schema.
- DEF-007 (HIGH) gift-card / store-credit over-tender silently burned customer balances. Fixed (non-cash may not exceed order total).
- DEF-008 (HIGH) refund pro-ration round-up could exceed the original line total; final-slice exact closure. Fixed (telescoping allocation).
- DEF-009 (HIGH) negative refund quantities accepted at service level in mixed refunds → negative refunded_qty and negative stock "refund" movements. Fixed.
- DEF-010 (HIGH) register expected-cash mis-counted split-tender 'original' refunds (whole refund treated as cash-out). Fixed via deterministic allocation replay.
- DEF-011 (MEDIUM) refund tender allocation order depended on UUID tiebreak for same-timestamp splits (nondeterministic gift-card restore). Fixed with rowid ordering.
- DEF-005 (HIGH) arbitrary modifier option IDs (unlinked/inactive) applied their price delta → price tampering. Fixed (linkage/active/max_select validation).
- DEF-006 (MEDIUM) fractional quantities on non-weighted items. Fixed.
- DEF-019 (LOW) LIKE-pattern wildcard injection in product/customer/supplier search. Fixed.
- DEF-020 (MEDIUM) receipts printed hardcoded demo identity, allowed newline injection (receipt forgery), truncated paisa. Fixed.

**Security / scope / audit:**

- DEF-001 (HIGH) lock screen was UI-cosmetic: IPC remained fully authorized while locked. Fixed (`SessionStore.get()` nulls when locked; unlock = PIN re-login).
- DEF-012 (HIGH) kitchen board leaked other branches' tickets. Fixed.
- DEF-002 (MEDIUM) login lockout case-sensitivity bypass. Fixed.
- DEF-003 (MEDIUM) deactivated users kept privileges on live sessions. Fixed.
- DEF-013 (MEDIUM) orders accepted other branches' tables; register/customer refs unvalidated. Fixed.
- DEF-014 (MEDIUM) restaurant state machine could resurrect completed/void orders (requestBill bump). Fixed with a transition map.
- DEF-015 (MEDIUM) table transfer/move/close audited as NULL actor. Fixed.
- DEF-021 (MEDIUM) gift-card expiry never enforced. Fixed.

**Integrity / concurrency / operations:**

- DEF-016 (MEDIUM) openTable check-then-insert was non-atomic → duplicate active orders/numbers under real multi-process race. Fixed.
- DEF-017 (HIGH) concurrent duplicate clientOpId surfaced raw SQLITE_CONSTRAINT instead of idempotent replay on create/tender/refund/receive. Fixed.
- DEF-018 (MEDIUM) onboarding opening float collected but never applied (no shift). Fixed.
- DEF-022 (HIGH) 26 preload-invoked channels had no handler (dead API): registered the query/report/receipt handlers (taxes/discounts/modifiers lists, orders:receipt, orders:cancelHeld, payments:recent, register:xReport/zReport, audit:list, users:list, roles:list) and REMOVED the never-implemented write surface from the preload + PosApi types + docs. Guard test prevents recurrence.
- DEF-023 (LOW) fixed /tmp test paths → cross-run interference (produced the one flaky critical run before the fix). Fixed with per-PID paths.
- DEF-024 (LOW) axe-core test chunk ships dormant in production builds (env-gated). Documented, accepted.

## 3. Regression evidence

- 3× consecutive critical runs (full vitest 175 + e2e 18): **ALL GREEN** — `artifacts/run-20260925-181543/critical/`
- Note: an earlier "run 1" failed due to my own concurrent coverage process colliding on shared /tmp DB paths; after DEF-023 fix, three consecutive clean runs passed with no flakes.

## 4. Global database reconciliation

After each suite and at the end: `PRAGMA integrity_check` = ok, `PRAGMA foreign_key_check` = 0 rows (asserted inside every adversarial test teardown and in the packaged smoke). Capstone re-verifies money/payments/refunds/stock/register against independent SQL (existing test, green ×3; re-run post-fix).

## 5. Coverage (vitest v8 — statements/branches/functions)

Core financial & safety modules: money 94/90/81, pricing 86/94/90, orderService 87/97/97, paymentService 87/97/100, registerService 87/96/89, migrator 100/100/100, syncService 100/100/100, settingsService 91/100/100, systemService 95/100/91, onboardingService 99/100/100, purchaseService 91/98/95, customerService 84/97/86, restaurantService 68/72/74, authService 65/75/63. Entry windows/api/models/type modules are 0% by unit-coverage (exercised via real-Electron e2e instead). Behavioral coverage (not line %): IPC fuzz (1,144 probes over 78+ registered channels), state-machine transitions, error paths, and idempotency races are the evidence, per the anti-coverage-theater rule.

## 6. Performance (measured, not fabricated)

- Packaged cold boot on this machine: 708 ms to first paint, 855 ms interactive (`scripts/perf-startup.mjs`).
- Existing perf harness (`tests/integration/perf.test.ts`, 5 tests) green: catalog/order/payment hot paths at seed scale.
- Money fuzz: 100k add/sub ops + 50k allocations + 20k priceOrders complete inside 30 s test budget.

Not measured (declared limits): >10k-product catalogs, >100k-order histories, hour-long soak, multi-terminal LAN deployment.

## 7. Packaging

- **Built:** linux-unpacked (+ previously built AppImage/deb; NSIS + portable EXE artifacts present from the v0.2.0 cross-build).
- **Runtime-tested:** linux-unpacked (cold boot, seeded sale, PRAGMAs) under Xvfb.
- **Built but NOT runtime-testable here:** Windows NSIS/portable (native argon2 win32 binding packaged via `scripts/win-natives.mjs`; no Windows host in this environment), macOS DMG (not built; no macOS host).

## 8. Known remaining gaps (honest list)

- **Feature-absent (previously dead channels, now truthfully removed from preload/docs):** user/role write management, product/category/modifier write APIs, floor-zone creation via UI, hardware virtualScan, data import/export channels, remote sync transport (local outbox only — per OFFLINE_SYNC.md), KDS recall/fire channels.
- **UI gap:** POS has no modifier-selection widget — required/min modifier rules are deliberately NOT enforced server-side (would block sales); only linkage/active/max are.
- **Physical hardware** (printer/scale/drawer/scanner) tested via simulator only.
- **Timing:** lock-screen auto-lock _timer_ remains renderer-triggered (manual lock is now IPC-enforced after DEF-001).
- Session table rows written only on password login (PIN unlock refreshes the in-memory session; audited, but no `sessions` row) — minor audit-granularity gap.
- `payments.tender` accepts `serviceCharge`/`tip` fields that are intentionally ignored (totals live on the order) — API footgun, documented.

## 9. Verdict

**READY FOR VERIFICATION** — all discovered CRITICAL/HIGH defects are fixed and regression-locked; three consecutive full critical runs are green; the Linux package was runtime-smoke-tested. Not "VERIFIED" because: Windows/macOS runtimes, physical hardware, real remote sync transport, and >10k-scale endurance were not executable in this environment, and the documented feature gaps above remain open by scope.
