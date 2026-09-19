# APEXPOS — Build Progress

Legend: `[x]` implementation verified by tests/evidence · `[~]` partial (substantial work exists, known gaps documented in the audit) · `[ ]` not started / dead surface

Updated 2026-09-19 after the adversarial audit + repair pass (see `docs/AUDIT/RECON.md`, `docs/AUDIT/REPORT.md`).

## Phase Status

- [x] P0 — Scaffold, toolchain, CI, design tokens, app shell, routing, theme
- [x] P1 — Schema (42 tables), migrations (2), seed, repositories/services, money util
- [x] P2 — Auth (Argon2id, PIN, sessions, lockout, override rate-limiting), roles (10), permissions (44 keys), audit log
- [x] P3 — Retail POS: cart, per-product tax pricing, discounts, checkout, split tender, hold/recall, refunds (incl. store-credit/gift-card settlement), register shifts & variance
- [~] P4 — Hardware: simulated printer (real ESC/POS preview text), drawer, customer display window. No physical device adapters.
- [~] P5 — Inventory ledger + low stock + adjustments via sales/refunds; **no supplier/PO management UI yet** (schema only)
- [~] P6 — Restaurant: floor plan, table open/close, KDS board with bump; modifiers priced in orders; courses/transfer/merge not wired to IPC
- [x] P7 — Customers, loyalty ledger, gift cards, store credit (ledger-verified in tests)
- [~] P8 — Dashboard + sales/financial reports + CSV export (renderer-side); inventory/staff/purchasing report endpoints not built
- [~] P9 — Settings service + UI, backup/restore (path-safe, audited), notifications; **no onboarding wizard, no import, no receipt designer, no i18n strings wired**
- [~] P10 — Command palette, shortcuts partially; no accessibility (axe) suite yet
- [~] P11 — Tests: 61 unit/integration + 11 E2E (Playwright/Electron); concurrency/chaos suites not built
- [~] P12 — Packaging: `package:dir` verified + packaged launch smoke-tested on Linux; NSIS/DMG configured but not built/tested; docs partially reconciled

## Verified Gate Results (2026-09-19, this machine)

- `npm run format:check` PASS (was 63-file failure — fixed)
- `npm run lint` PASS · `npm run typecheck` PASS · `npm run format:check` PASS
- `npm test` 61/61 PASS (10 files: 4 unit, 5 integration, 1 component)
- `npm run coverage` ≈ 50% statements (money/pricing/payment paths are the well-covered core)
- `npm run build` PASS · `npm run test:e2e` 11/11 PASS (real Electron, disposable DB)
- `npm run package:dir` produces `release/linux-unpacked`; packaged binary cold-starts and creates a healthy WAL database
- `npm audit` — 0 vulnerabilities

## Key Decisions

- Money: integer minor units everywhere; central `money.ts` (round half-away-from-zero; `-0` normalized).
- Pricing engine is shared (`src/shared/lib/pricing.ts`): the renderer preview and the server charge run the same pure function; the server is authoritative.
- Idempotency: `client_op_id` on orders/payments/refunds (UNIQUE) — retries are safe no-ops.
- IPC: allowlisted channels, zod schemas, permission enforced in main (`requiresAuth`/`permission`/`anyOfPermissions`, fail-closed).
- Hashing: `@node-rs/argon2` (m=19 MiB, t=2, p=1).

## Known Limitations (honest list)

- Single-branch in practice: branch scoping exists but multi-branch tenancy is untested end-to-end.
- No real physical hardware drivers (simulator-only); no external payment/tax provider integration.
- Sync (`sync_outbox`) and onboarding wizard are schema/API surface only — not implemented.
- Sessions are per-process; app restart requires re-login (by design for POS security).
- Demo PINs are `1234` for all users — **change before any real deployment**.
