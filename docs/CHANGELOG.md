# Changelog

All notable changes follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

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
