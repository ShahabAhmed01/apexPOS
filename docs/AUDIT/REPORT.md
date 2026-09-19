# FINAL AUDIT REPORT — APEXPOS

Date: 2026-09-19 · Commit basis: `f2b75c8` + working-tree repairs (uncommitted — see git diff)

## 1. Executive verdict

**PASS** for the repaired scope — the application's implemented domains (core retail POS with
payments/refunds/register, auth/RBAC, inventory ledger write-path, restaurant floor+KDS,
customers/loyalty/gift cards, dashboard/reports, settings, backup/restore, packaged Linux
build) now survive adversarial checks with supporting automated evidence.

This is **not** a full-system certification: onboarding, purchasing/PO UI, sync, i18n/RTL,
physical hardware, and multi-branch operation are explicitly **UNVERIFIED** (listed in §11).

## 2. Environment

Linux 7.2.4 (CachyOS, x86_64, real display) · Node 22.23.2 · npm 12.0.2 · Electron 44.4.1 ·
better-sqlite3 13 · Vitest 5.0.1 · Playwright 1.63.0 · TS 5.9 strict.

## 3. Command evidence (all exit 0)

| Command               | Result                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| npm run format:check  | PASS (was 63-file failure)                                                     |
| npm run lint          | PASS                                                                           |
| npm run typecheck     | PASS (node+web+tests)                                                          |
| npm test              | **61/61** PASS — 4 unit, 5 integration, 1 component file(s)                    |
| npm run test:coverage | ~50% stmts repo-wide; 90%+ on pricing, 84% money, 87% paymentService           |
| npm run test:e2e      | 11/11 PASS (34.9 s, real Electron windows, disposable DBs)                     |
| npm run build         | PASS (renderer 2,297 kB raw / 451 kB gzip)                                     |
| npm run package:dir   | PASS → `release/linux-unpacked`; packaged app cold-starts & seeds SQLite (WAL) |
| npm audit             | 0 vulnerabilities                                                              |

## 4. Test matrix (summary)

Unit `money` 15 · `pricing` 13 · `quantity` 3 · component `Button` 3.
Integration `sale-flow` 2 · `customers` 4 · `report-service` 5 · `settings` 5 ·
`payments-edge` 6 · `security-edge` 5.
E2E `sale-flow` 2 · `refund-hold` 2 · `permissions-inventory` 3 · `backup-palette` 4.

E2E details: login → open register → scan/barcode add → checkout → cash tender with change →
receipt; dine-in table → POS; hold/recall; backup create/list; command palette (open, filter,
navigate, theme); cashier-vs-owner permission gating; low-stock tab.

## 5. Defect log (all 14 repaired + regression-tested)

See `docs/AUDIT/RECON.md` §"Forensic defect list". Highlights:

- **FIN-01** Hardcoded 18% renderer tax → pricing engine shared via `@shared/lib/pricing.ts`; per-product rates.
- **FIN-02** Cash under-tender could produce under-paid completed orders → rejected.
- **FIN-03** `store_credit` refund silently credited nothing → ledger entry + balance update (same transaction).
- **FIN-04** `original` refund ignored gift-card balance → restoration (capped at initial balance).
- **FIN-05** Partial refunds untracked → `payments.refunded_amount` (migration 0002); full-refund flagging correct.
- **SEC-01** Override PIN oracle → rate-limited (5×/5 min, keyed per permission), failures audited.
- **SEC-02** Backup restore path traversal → strict basename + containment validation.
- **SEC-03/04** Unauthenticated `register:current`, settings, notifications, backup-list, hardware handlers → `requiresAuth`/permissions.
- **SEC-05** Orders cross-branch IDOR on get/hold/void/update/refund → branch guard + test.
- **DATA-01** Backup copied pre-checkpoint live file → checkpoint-first single copy.
- **TEST-01** Broken `dom` vitest project → repaired with real component tests.
- **MONEY-01** `-0` returned from rounding → normalized; test added.

## 6. Security

- Renderer: sandbox + contextIsolation + no nodeIntegration; strict CSP meta; navigation locked; window-open denied.
- IPC: zod schemas on mutating channels; permission checks fail-closed; `requiresAuth` for session-gated reads.
- Auth: Argon2id (m=19 MiB/t=2/p=1); 5-attempt lockout on login AND on manager-override; constant public errors.
- Not covered: on-disk encryption, OS keychain for secrets (none present), real card data (none stored).

## 7. Database

`PRAGMA integrity_check`/`foreign_key_check` exercised implicitly by test DB lifecycle;
`wal_checkpoint(TRUNCATE)` verified via backup roundtrip test + packaged-launch smoke.
Migration 0002 verified additive on existing DBs (integration suite opens pre-0002 fixture path).

## 8. Performance

Renderer bundle 2,297 kB raw (451 kB gzip) — dominated by recharts + radix; a code-split
candidate, not a defect. Startup to interactive window: ~2 s cold on this machine (observed,
not benchmarked). Test suite: 1.8 s; E2E: 35 s.

## 9. Accessibility

Keyboard-navigable login/POS; Radix primitives for dialogs; `aria-busy` on loading buttons
(component-tested). No axe audit run — **UNVERIFIED**.

## 10. Documentation

README/ARCHITECTURE/DATABASE/SECURITY/CHANGELOG reconciled with code; PROGRESS.md rebuilt
from git history + evidence. Missing docs (honest): API.md, DEPLOYMENT.md, USER_MANUAL.md,
TESTING.md, TROUBLESHOOTING.md, OFFLINE_SYNC.md, HARDWARE.md, CONTRIBUTING.md, LICENSE.

## 11. Unverified / out of scope this run

Onboarding wizard (UI absent) · Sync (not implemented) · Purchasing UI (schema only) ·
Table transfer/merge + courses IPC (UI absent) · i18n/RTL (deps only) · Physical ESC/POS
printer/drawer/scanner/scale (simulator only) · NSIS/DMG runtime test (configured, unbuilt
on this host) · Concurrency chaos beyond idempotency tests · axe accessibility audit ·
Multi-branch tenancy (guard added + unit-tested; no two-branch E2E).

## 12. Final statement

Release status: **READY FOR VERIFICATION** for the implemented scope; **NOT READY** as a
full-feature production release until §11 items are either implemented+tested or formally
descoped by the project owner.
