# APEXPOS

**Offline-first hybrid Retail + Restaurant desktop POS** — built with Electron, React 19, TypeScript, and SQLite.

## Features

- **Retail POS** — product grid, barcode scan, cart, discounts, split tender, receipt printing (ESC/POS)
- **Restaurant mode** — floor plan with zones/tables, table states, send to kitchen, Kitchen Display System (KDS)
- **Inventory** — product catalog, stock movements, low-stock alerts, suppliers, purchase orders
- **Customers** — CRM, loyalty points, store credit, gift cards (auditable transactions)
- **Reports** — real-time dashboard (sales, orders, payment mix, hourly heatmap), sales/financial reports, CSV export
- **Settings** — 7 sections (Appearance, Business, Localization, Currency, POS behavior, Security, Backup & Data)
- **Command Palette** — Ctrl+K fuzzy search for navigation and actions
- **Offline-first** — local SQLite (WAL), no cloud dependency
- **Role-based access** — 10 built-in roles with granular permissions

## Tech Stack

| Layer | Stack |
|-------|-------|
| Desktop | Electron 44, electron-vite 5, Vite 7 |
| UI | React 19, TypeScript 5.9 (strict), Tailwind 4, Radix UI, Zustand, TanStack Query |
| DB | better-sqlite3 13 (WAL), Argon2id (node-rs/argon2) |
| Testing | Vitest 5 (node + jsdom), Playwright (Electron E2E) |
| Packaging | electron-builder 26 (NSIS / AppImage / deb / DMG) |

## Quick Start

```bash
# Prerequisites: Node 20+, npm
npm ci
npm run dev          # dev with hot reload
npm run build        # production build
npm run test         # unit + integration tests (Vitest)
npm run test:e2e     # E2E tests (Playwright + Electron)
npm run package:dir  # unpacked build for testing
npm run package      # distributable installers
```

## Default Users (seeded)

| Username | Password | Role |
|----------|----------|------|
| owner | Owner123! | Owner (all permissions) |
| admin | Admin123! | Administrator |
| manager | Manager123! | Manager |
| cashier | Cashier123! | Cashier (POS, tables, customers) |
| waiter | Waiter123! | Waiter (tables, kitchen) |
| kitchen | Kitchen123! | Kitchen (KDS) |
| inventory | Inventory123! | Inventory |
| purchasing | Purchase123! | Purchasing |
| accountant | Account123! | Accountant |
| auditor | Audit123! | Auditor |

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
├── unit/                 # Money, Quantity, Pricing
├── integration/          # Sale flow, Reports, Customers, Settings
└── e2e/                  # Playwright E2E (11 scenarios)
```

## Data Directory

On first run, a local database is created at:

- Linux: `~/.config/apexpos/apexpos.db`
- Windows: `%APPDATA%/apexpos/apexpos.db`
- macOS: `~/Library/Application Support/apexpos/apexpos.db`

Override with `APEXPOS_DATA_DIR=/custom/path`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for process model, IPC design, and data flow.

## Database Schema

See [DATABASE.md](DATABASE.md) for tables, indexes, and migrations.

## Security

See [SECURITY.md](SECURITY.md) for threat model, PIN/argon2, permissions, and IPC hardening.

## License

Proprietary — Final year project (2026).
