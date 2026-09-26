# Changelog

All notable changes follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [0.2.1] - 2026-09-26

Phase-3 adversarial hardening cycle: a falsification-first audit of money, security, scope,
concurrency and the IPC surface. 24 defects were proven RED first, fixed, and locked in with
regression tests (full record: `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`). Suite grew 119 → 175
tests; e2e 18/18 ×3 consecutive runs; `npm audit` 0 vulnerabilities.

### Added

- Adversarial suites: `adversarial-money` (21), `adversarial-security` (10), `adversarial-ipc`
  (11, ~1,144 probes over every registered channel), `adversarial-concurrency` (3, incl.
  4-OS-process table race), `money-fuzz` (~205k deterministic cases vs. an independent oracle).
- Dead-channel guard test: the preload surface must be a subset of registered handlers.
- Registered the previously dead read/report channels backed by real queries:
  `orders:receipt`, `orders:cancelHeld`, `payments:recent`, `register:xReport`,
  `register:zReport`, `taxes:list`, `discounts:list`, `modifiers:list`, `audit:list`,
  `users:list`, `roles:list`.
- `ReceiptBusiness` plumbing: receipts (renderer + ESC/POS + IPC) show the business identity
  from Settings instead of a hardcoded demo store.

### Fixed

- **Cart percent discounts were unbounded** — >100% produced negative order totals; non-integer
  bps crashed with `INTERNAL`. Now integer 0..10000 bps at both the pricing engine and the IPC
  schema (discriminated union with bounds).
- **Gift-card / store-credit over-tender burned customer balance** — non-cash tenders may no
  longer exceed the outstanding total; only cash may over-tender (with change).
- **Refund pro-ration could over-refund** — amounts now follow a telescoping rule that closes
  exactly on the final slice; negative/zero/duplicate refund lines rejected at service level.
- **Split-tender refunds mis-counted in register expected cash** — replaced the EXISTS heuristic
  with a deterministic FIFO replay of the payment allocation; allocation itself made
  deterministic (`ORDER BY created_at, rowid`) for same-timestamp splits.
- **Modifier options bypassed product linkage** — unlinked/inactive options applied their price
  delta (price tampering). Now existence, `is_active`, group linkage and `max_select` are
  enforced server-side. (Required/min selection remains unenforced — documented UI gap.)
- **App lock was UI-cosmetic** — `SessionStore.get()` now returns no session while locked, so
  every privileged IPC handler rejects; unlock is PIN re-login only.
- **Login lockout case-sensitivity** — failed-attempt counters keyed case-insensitively.
- **Deactivated users kept privileges** on live sessions (`hasPermission` checks `is_active`).
- **Kitchen board leaked other branches' tickets** — branch filter added.
- **Cross-branch references** — `orders:create` validates table/register/customer scope.
- **Restaurant state machine** — terminal states (completed/void) immutable; `requestBill` /
  `bumpTicket` can no longer resurrect orders.
- **Audit actor attribution** — transfer / move-lines / close-table write the real acting user.
- **`openTable` race** — occupancy check + insert + order-number allocation now one IMMEDIATE
  transaction (proven with 4 concurrent OS processes).
- **Concurrent duplicate `clientOpId`** surfaced raw `SQLITE_CONSTRAINT` instead of the
  winner's result — unique-violation now replays idempotently (create/tender/refund/receive).
- **Onboarding opening float** now opens the first shift instead of being dropped.
- **LIKE wildcard injection** in product/customer/supplier search (consistent `ESCAPE`).
- **Receipts**: newline injection in names/notes sanitized (no forged receipt lines); money
  formatted with 2 decimals; demo identity removed.
- **Test determinism**: fixed `/tmp` DB paths replaced with per-PID paths (no cross-run races).
- Documentation reconciled with reality: `docs/API.md` channel table rewritten to the
  registered surface (+ explicit feature-gap list), `docs/SECURITY.md` lock semantics,
  `docs/DEPLOYMENT.md` build matrix, `docs/HARDWARE.md`, READMEs, `PROGRESS.md`.

### Removed

- 15 never-implemented channels dropped from the preload + `PosApi` types (they previously
  rejected at runtime with "No handler registered" while docs claimed support):
  `app:unlock`, `users:create/update/setActive`, `roles:create/update/delete`,
  `products:create/update/archive`, `categories:create/update/delete`, `modifiers:save`,
  `floors:save` (zones), `hardware:virtualScan`.

## [0.2.0] - 2026-09-25

### Added (phase-2 close-out — 2026-09-23)

- Purchasing: `PurchasingScreen` (suppliers, PO create/send/partial-receive/final-receive/cancel)
  with WAC costing, idempotent receive (clientOpId), over-receive rejection, branch guards.
- Restaurant: real table transfer / move-lines (split bill) / merge / request-bill + safe
  close-table (refuses unpaid orders; voids empty ones) + branch guards on every mutation.
- Inventory: `inventory:adjust` end-to-end (positive/negative delta, note, manager PIN,
  `stock_movements` + audit).
- POS: F2/F9/F10/F11 keyboard shortcuts actually bound; Enter-on-search adds top hit;
  `/pos?order=<id>` loads a table's active dine-in order into the cart.
- Onboarding wizard, sync outbox, i18n (en/ur) + RTL, a11y hardened; axe harness via
  `APEXPOS_AXE=1` test hook.
- Tests: purchasing / multibranch / concurrency / chaos / sync / restaurant suites +
  full-day capstone reconciliation + perf harness + packaged-smoke.
- Packaging smoke script (`scripts/packaged-smoke.mjs`), perf startup (`scripts/perf-startup.mjs`),
  critical-runs runner (`scripts/critical-runs.sh`).

### Fixed (phase-2 close-out — 2026-09-23)

- `openTable` placeholder/label bug (every seating attempt threw; receipts got bare `T-XXXX`).
- `closeTable` no longer force-completes unpaid orders (payment bypass closed).
- `RegisterService.close`/`cashMovement` IPC were not branch-scoped (cross-branch shift control).
- Shift `expectedCash` no longer double-deducts change or full-refunded cash.
- Refunds no longer create phantom stock movements for untracked products.
- Backup restore validates integrity + FK + schema fingerprint before swapping; stale WAL
  sidecars removed on restore.
- Multi-step language menu no longer auto-closes on the clock tick.
- WCAG AA contrast for muted text and accent-filled buttons; scroll regions keyboard-focusable.
- E2E profiles are hermetic (per-run `--user-data-dir`); no cross-suite leakage.

## [Previous]

### Fixed (adversarial audit — 2026-09-19)

- **Renderer tax preview no longer hardcodes 18%**: the POS preview uses the shared pricing
  engine (`@shared/lib/pricing`) with each product's configured tax rate; the server remains
  authoritative at tender time.
- **Cash under-tender rejected**: a cash payment where `tendered < amount` is now a validation
  error instead of completing an under-paid order.
- **Refunds honor the settlement method**: `store_credit` refunds issue a store-credit ledger
  entry; `original` refunds restore gift-card balance (capped at the card's initial balance).
- **Partial refunds tracked per payment** (`payments.refunded_amount`, migration 0002); a
  payment is marked `refunded` only when its full amount has been refunded.
- **Manager-override PIN oracle closed**: `verifyOverride` is rate-limited (5 attempts →
  5 min lockout) and failed attempts are audited.
- **Backup restore path traversal rejected**; backups checkpoint the WAL before copying once.
- **Deterministic simulated card references** — `Math.random` removed from the payment path.
- **Unauthenticated IPC tightened**: `AppLock`/settings/notifications/backup-list/hardware
  surfaces now require a session or explicit permission (`requiresAuth` registry option).
- **Order access is branch-scoped** (get/hold/void/update/refund reject other branches' orders).
- Broken `dom` Vitest project repaired (setup file + component tests).
- `money.roundHalfAwayFromZero` normalizes `-0` to `0`.
- Documentation claims reconciled with implementation (SECURITY.md params, ARCHITECTURE.md
  receipt/backup flow, DATABASE.md phantom tables, README data paths and feature claims).

### Added
- P11: E2E test matrix (11 scenarios) via Playwright + Electron
- P10: Command Palette (Ctrl+K) with fuzzy search, navigation, theme toggle
- P9: Settings service + IPC, full 7-section Settings UI, Backup/Restore (SQLite online backup), Notifications, Select/Switch components
- P8: ReportService (dashboard, sales, financial, hourly, categories), Reports screen with CSV export, 60-day synthetic history seed
- P7: CustomerService + IPC (CRUD, loyalty/store-credit audit, gift cards), Customers screen with search, edit, loyalty adjust
- P6: Restaurant floor plan (zones, tables, live status), Kitchen Display System (KDS) with urgency colors/bump
- P5: Inventory screen (products/movements/low-stock tabs), catalog IPC (search/barcode/onHand/lowStock)
- P4: HardwareService (ESC/POS receipt renderer, virtual printer/drawer), Customer Display window with live cart sync
- P3: POS screen (catalog grid, cart, checkout, receipt, hold/discount modals), cart store + computeTotals
- P2: AuthService (login, PIN, sessions, roles, audit), OrderService, PaymentService, RegisterService, ProductService, Pricing
- P1: Schema + migrator + seed (82 products, 10 users/roles, 10 tables, 12 customers, 3 suppliers, 60-day history), money/quantity/pricing libs
- P0: Scaffold (Electron + Vite + React 19 + TS strict), CI, electron-builder, design tokens, dark/light/system theme

### Fixed
- FloorScreen IPC mismatch (tables/zone filtering)
- Command Palette stale-selection bug (mouse hover vs keyboard)
- Settings default theme enum crash on boot
- Held orders display name ("Hold #1" vs custom name)
- Cash click completes sale immediately (no separate Charge step)

## [0.1.0] - 2026-09-18

Initial scaffold and P0–P2 complete.
