# RECON — APEXPOS Repository Reconnaissance

Run: 2026-09-19 · Commit: `f2b75c8` (+ subsequent working-tree repairs)
Environment: Linux 7.2.4 (CachyOS), Node v22.23.2, npm 12.0.2, Electron 44.4.1, better-sqlite3 13, Vitest 5.0.1, Playwright 1.63.0 (real display — no xvfb needed).

## Baseline gates (before repairs)

| Gate                   | Result                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run format:check` | **FAIL** — 63 files (CI would fail)                                                             |
| `npm run lint`         | PASS                                                                                            |
| `npm run typecheck`    | PASS (strict + noUnusedLocals + noUncheckedIndexedAccess)                                       |
| `npm test`             | 42/42 PASS (7 files; `dom` project broken: missing `tests/setup.dom.ts`, no `tests/component/`) |
| `npm run build`        | PASS (renderer bundle 2,297 kB raw / 451 kB gzip)                                               |
| `npm run test:e2e`     | 11/11 PASS (real Electron, disposable `/tmp` data dirs)                                         |
| `npm audit`            | 0 vulnerabilities                                                                               |

## Inventory

- **42 tables**, 37 indexes, single initial migration (`0001_initial`); `migrations` table bookkeeping.
- **Database pragmas**: WAL ✔ foreign_keys ✔ busy_timeout 5s, synchronous NORMAL. mmap_size 30 GB (harmless but odd).
- **Seed**: 1 org, 1 branch, 1 register, 1 terminal, 10 roles (158 role_permission rows), 10 users (all PINs `1234`), 9 categories, 82 products (57 retail incl. 1 variant parent + 25 menu), 12 variants, 10 tables in 2 zones, 12 customers, 3 suppliers, 2 gift cards, 387 synthetic historical orders (deterministic LCG). Seeded variant barcodes + stock quantities use `Math.random` — **non-deterministic despite "deterministic" comment** (documented defect; quantities vary run to run).
- **IPC**: 147 channel constants; **59 registered handlers**; 88 channel constants with no handler (documented dead surface; preload exposes typed wrappers that would reach them).
- **Tests**: 7 integration/unit files (42 tests), 4 E2E specs (11 tests) using `_electron.launch` with fresh `APEXPOS_DATA_DIR` per spec run.

## Contract matrix — notable findings (pre-repair)

| Channel                                  | Schema                   | Auth                         | Notes                                                                                     |
| ---------------------------------------- | ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| auth.login / loginPin                    | ✔                        | public                       | rate-limited ✔                                                                            |
| auth.requireOverride                     | ✔                        | none                         | **PIN brute-force oracle** (fixed: rate-limited, failures audited)                        |
| register:current                         | ✗                        | **none**                     | leaked open shift unauthenticated (fixed: requiresAuth + branch-scoped)                   |
| settings:get/all                         | ✗                        | **none**                     | (fixed: requiresAuth)                                                                     |
| notifications:list/markRead              | ✗                        | **none**                     | (fixed: requiresAuth + schema)                                                            |
| backup:list                              | ✗                        | **none**                     | leaked absolute paths (fixed: `data.backup`)                                              |
| backup:create                            | ✗                        | settings.manage              | (fixed: `data.backup`; audited; single consistent copy)                                   |
| backup:restore                           | file field unconstrained | settings.manage              | **path traversal** (fixed: basename whitelist + containment + audit; perm `data.restore`) |
| hardware:test / hardware:customerDisplay | ✔/opt                    | **none**                     | (fixed: requiresAuth)                                                                     |
| hardware:openDrawer                      | ✗                        | cash.no_sale                 | ✔                                                                                         |
| orders:* (9)                             | ✔                        | per-op                       | fail-closed; branch scoping added on order lookup/void/hold/update                        |
| payments:tender / refund                 | ✔                        | payments.take / sales.refund | see defects below                                                                         |

No handler validates `event.sender`/`senderFrame` — **station-level trust assumption documented in SECURITY.md** (single-window app; both windows share one preload allowlist).

## Forensic defect list (repaired)

1. Hardcoded 18% tax preview in renderer (`computeTotals.ts`) + `taxBps: 1800` hardcode in `cartStore` + label "Tax (18%)".
2. Cash `tendered < amount` silently recorded an under-paid completed order (payments.sum < order.total).
3. `refundMethod` ignored: `store_credit` refunds vanished (no ledger entry, no balance change).
4. Gift-card payments refunded to `original` did not restore card balance.
5. Payments marked `refunded` only via `WHERE ? >= amount` hack; partial refund state untracked.
6. `verifyOverride` PIN oracle without rate limiting.
7. `backup:restore` path traversal.
8. `createBackup` copied live DB before checkpoint (first copy potentially inconsistent), then copied again.
9. `Math.random()` used for simulated card approval codes (non-deterministic financial artifacts).
10. `settings.set` unknown key → unhandled TypeError → INTERNAL.
11. Broken `dom` Vitest project (missing setup file, empty component dir).
12. `RefundInput.managerUserId` required but ignored everywhere (misleading contract — removed).
13. `roundHalfAwayFromZero(-0)` returned `-0`.
14. Doc/claims mismatches: SECURITY.md (argon2 params, auto-lock, sessions table), ARCHITECTURE.md (`orders.receipt`, `db.backup()`), DATABASE.md (`product_images`, `tax_rates`, `table_sessions`, "10 categories"), README data path, PROGRESS.md contradiction with CHANGELOG/git log.

## Known limitations (not fixed, by scope decision)

- No sender/senderFrame validation in IPC registry (station-trust model; documented).
- Session is a single in-memory singleton; second-window login shares the operator session (design; documented).
- 88 channel constants + ~45 preload methods are declared-but-unregistered (dead surface, not dead UI: UI doesn't call them).
- i18n dependencies present but no strings externalized; RTL not implemented.
- `sessions` DB table written only on password login; in-memory map is authoritative.
