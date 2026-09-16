# APEXPOS — Build Progress

Legend: `[ ]` pending · `[x]` complete

## Phase Status

- [x] P0 — Scaffold, toolchain, CI, design system, app shell, routing, theme
- [x] P1 — Database schema, migrations, seed, repositories, money util, domain services
- [x] P2 — Auth, users, roles, permissions, sessions, lock, audit trail
- [ ] P3 — Retail POS (cart, discounts, tax, checkout, split tender, receipts, refunds, register)
- [ ] P4 — Hardware abstraction + simulators + customer display
- [ ] P5 — Inventory ledger, suppliers, purchasing, receiving, adjustments
- [ ] P6 — Restaurant mode (floor plan, tables, modifiers, courses, KDS, split bill)
- [ ] P7 — Customers, loyalty, gift cards, store credit, promotions
- [ ] P8 — Reporting, analytics, exports
- [ ] P9 — Settings, receipt designer, backup/restore, import/export, onboarding, i18n
- [ ] P10 — UX polish, command palette, shortcuts, accessibility, responsive
- [ ] P11 — Testing hardening, security review, concurrency, offline sync
- [ ] P12 — Packaging, documentation, release acceptance

## Current Work

P0 — repository scaffold, pinned toolchain (Electron 44 / electron-vite 5 / React 19 /
TypeScript strict / better-sqlite3 / Tailwind 4 design tokens).

## Verified Gate Results

(none yet)

## Known Issues

(none yet)

## Key Decisions

- Money: integer minor units everywhere; central `money` utility (`half-up` rounding).
- DB access only from main process; renderer talks over validated allowlisted IPC.
- Hashing: `@node-rs/argon2` (N-API prebuilds → no per-Electron rebuild).
- Preload bundled as sandboxed CJS (`sandbox: true`, `contextIsolation: true`).
- Tests: Vitest projects `node` (unit+integration, real better-sqlite3 against temp DBs),
  `dom` (jsdom component tests), Playwright for Electron E2E.
