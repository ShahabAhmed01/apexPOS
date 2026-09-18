# Changelog

All notable changes follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

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
