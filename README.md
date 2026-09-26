# APEXPOS

**Offline-first hybrid Retail + Restaurant desktop POS** — built with Electron, React 19, TypeScript, and SQLite.

## Features

- **Retail POS** — product grid, barcode scan (keyboard-wedge), cart, discounts, split tender, hold/recall, refunds; keyboard-only operation (F2 search, F9 cash, F10 card, F11 wallet); simulated receipt printing (ESC/POS renderer; physical printer unverified)
- **Restaurant mode** — floor plan with zones/tables, seat → order on POS → pay → table frees, transfer, move items / split bill, merge tables, request bill, KDS board with bump
- **Purchasing** — suppliers, purchase orders (draft → sent → partially received → received / cancelled), idempotent receiving, weighted-average costing, branch-scoped
- **Inventory** — product catalog, stock movement ledger (opening + Σ movements = on-hand), low-stock alerts, manager-authorized stock adjustments / waste
- **Customers** — CRM, loyalty points, store credit, gift cards — all ledger-reconciled
- **Reports** — real-time dashboard (sales, orders, payment mix, hourly heatmap), sales/financial reports, CSV export
- **Settings** — 7 sections + onboarding wizard (business → locale → currency → tax → mode → admin → theme → register → hardware → demo data)
- **Command Palette** — Ctrl+K fuzzy search
- **Offline-first** — local SQLite (WAL); sync outbox is queued locally and honest about the absence of a remote target
- **Role-based access** — 10 built-in roles, granular permissions, manager-PIN overrides (rate-limited)
- **i18n + RTL** — English & Urdu (RTL) with surviving in-progress cart state on language switch
- **Accessibility** — axe WCAG 2 A/AA audit clean (critical/serious) on all primary screens
- **Adversarially hardened** — money, refunds, refunds exactness, register cash, modifier pricing,
  sessions/lock, branch scope, IPC fuzzing and multi-process races all regression-tested
  (see [Verification](#verification))

## Tech Stack

| Layer     | Stack                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Desktop   | Electron 44, electron-vite 5, Vite 7                                             |
| UI        | React 19, TypeScript 5.9 (strict), Tailwind 4, Radix UI, Zustand, TanStack Query |
| DB        | better-sqlite3 13 (WAL), Argon2id (node-rs/argon2)                               |
| Testing   | Vitest 5 (node + jsdom), Playwright (Electron E2E)                               |
| Packaging | electron-builder 26 (NSIS / AppImage / deb / DMG)                                |

## Quick Start

```bash
# Prerequisites: Node 20+, npm
npm ci
npm run dev          # dev with hot reload
npm run build        # production build
npm run test         # unit + integration tests (Vitest)
npm run test:e2e     # E2E tests (Playwright + Electron)
npm run test:torture # 53-test live torture suite (separate config, needs `npm run build` first)
npm run package:dir  # unpacked build for testing
npm run package      # distributable installers
```

Prebuilt installers (Linux AppImage/deb, Windows NSIS/portable) are published on the
[GitHub Releases](https://github.com/ShahabAhmed01/apexPOS/releases) page.

## Default Users (seeded)

| Username   | Password      | Role                             |
| ---------- | ------------- | -------------------------------- |
| owner      | Owner123!     | Owner (all permissions)          |
| admin      | Admin123!     | Administrator                    |
| manager    | Manager123!   | Manager                          |
| cashier    | Cashier123!   | Cashier (POS, tables, customers) |
| waiter     | Waiter123!    | Waiter (tables, kitchen)         |
| kitchen    | Kitchen123!   | Kitchen (KDS)                    |
| inventory  | Inventory123! | Inventory                        |
| purchasing | Purchase123!  | Purchasing                       |
| accountant | Account123!   | Accountant                       |
| auditor    | Audit123!     | Auditor                          |

All users have PIN `1234` for quick lock/unlock.

## Project Structure

```
src/
├── main/                 # Main process (Node)
│   ├── db/               # SQLite schema, migrator, seed
│   ├── services/         # Auth, Orders, Payments, Registers, Products, Reports, Customers, Settings
│   ├── ipc/              # IPC handlers (zod-validated, permission-gated)
│   ├── hardware/         # ESC/POS receipt, printer/drawer simulation
│   └── windows/          # Main window, Customer display window
├── preload/              # Sandboxed preload (CJS bundle)
├── renderer/             # React app
│   ├── features/         # POS, Inventory, Customers, Reports, Settings, Restaurant
│   ├── components/       # CommandPalette, etc.
│   ├── design-system/    # Button, Input, Modal, Select, Switch
│   ├── layouts/          # AppShell (sidebar nav, header)
│   └── stores/           # Zustand stores (session, theme, cart)
├── shared/               # Shared types, IPC contracts, money/quantity utils, errors, permissions, settings registry
tests/
├── unit/                 # Money, Quantity, Pricing + money-fuzz (205k deterministic cases)
├── integration/          # Sale flow, Payments edge, Security edge, Onboarding, Purchasing,
│                         #   Multi-branch, Concurrency, Chaos, Sync, Restaurant, Capstone day, Perf
│                         #   + adversarial-money / -security / -ipc / -concurrency suites
├── component/            # Design-system primitives
└── e2e/                  # Playwright E2E (18 scenarios incl. keyboard-only, axe, RTL, purchasing)
```

More: `docs/TESTING.md`, `docs/OFFLINE_SYNC.md`, `docs/HARDWARE.md`, `docs/DEPLOYMENT.md`,
`docs/API.md`, `docs/TROUBLESHOOTING.md`, `docs/CONTRIBUTING.md`, audit trail under
`docs/AUDIT/`.

## Verification

Every claim in this README is re-derivable from the suite. Latest full verification cycle:

| Gate                | Result                                                      |
| ------------------- | ----------------------------------------------------------- |
| format / lint / tsc | all clean                                                   |
| unit + integration  | **175/175** (Vitest, real SQLite, incl. adversarial suites) |
| E2E (real Electron) | **18/18**, three consecutive runs                           |
| torture E2E         | **53/53**, six consecutive runs (504 app launches)          |
| money fuzz          | ~205,000 deterministic cases vs. an independent oracle      |
| IPC fuzz            | every registered channel × malicious payload classes        |
| multi-process races | 4 OS processes on one DB (tables, gift cards, idempotency)  |
| DB reconciliation   | `PRAGMA integrity_check` + `foreign_key_check` clean        |
| packaged binary     | Linux unpacked cold-boot smoke (sale + WAL health)          |
| `npm audit`         | 0 vulnerabilities                                           |

Full evidence and defect register: [`docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`](docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md)
· live torture cycle (14 defects, 1 open): [`docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`](docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md).

## Data Directory

On first run, a local database is created at:

- Linux: `~/.config/apexpos/apexpos-data/apexpos.db`
- Windows: `%APPDATA%/apexpos/apexpos-data/apexpos.db`
- macOS: `~/Library/Application Support/apexpos/apexpos-data/apexpos.db`

Override with `APEXPOS_DATA_DIR=/custom/path`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for process model, IPC design, and data flow.

## Database Schema

See [DATABASE.md](DATABASE.md) for tables, indexes, and migrations.

## Security

See [SECURITY.md](SECURITY.md) for threat model, PIN/argon2, permissions, and IPC hardening.

## License

Proprietary — Final year project (2026).
