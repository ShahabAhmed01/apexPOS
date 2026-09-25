# APEXPOS — Build Progress

Legend: `[x]` implementation verified by tests/evidence · `[~]` partial (documented) · `[ ]` not started

Updated 2026-09-23 after the Phase 2 close-out cycle (see `docs/AUDIT/`).

## Phase Status

- [x] P0 — Scaffold, toolchain, CI, design tokens, app shell, routing, theme
- [x] P1 — Schema (42 tables), migrations (0001 + 0002), seed, services, money/pricing
- [x] P2 — Auth (Argon2id, PIN, sessions, lockout, override rate-limiting), 10 roles, 44+ perms, audit log
- [x] P3 — Retail POS: cart, per-product tax pricing, discounts, checkout, split tender, gift card,
      store credit, loyalty, hold/recall, refunds (incl. store-credit + original), register shifts
      with **method-aware expected cash** and explicit variance
- [x] P3a — Dine-in repaired: seat → order loaded in POS → pay → table frees (E2E); dead buttons
      wired: transfer / move-lines / merge / request-bill / close-empty-voids
- [x] P4 — Hardware simulator adapters + real ESC/POS receipt renderer + customer display window;
      physical adapters remain unverified (no hardware here)
- [x] P5 — Inventory ledger, low stock, sales/refund movements, **stock adjustments with manager
      override + audit**, receive history via purchasing
- [x] P5a — Purchasing: suppliers, full PO lifecycle, partial/receive/idempotent, WAC cost update,
      cross-branch guards, full UI + E2E
- [x] P6 — Restaurant: floor plan, table states, real dine-in lifecycle on tables, KDS board, bump,
      transfer / split-bill / merge / request-bill
- [x] P7 — Customers, loyalty ledger, gift cards, store credit — all ledger-=balance reconciled
- [x] P8 — Dashboard + sales/financial reports + CSV export (renderer-side)
- [x] P9 — Settings + backup/restore (path-safe, integrity-validated) + notifications +
      **onboarding wizard** (10 steps, resumable, transactional finish)
- [x] P10 — Command palette + keyboard-only POS (F2/F9/F10/F11/Enter); **axe WCAG A/AA = 0
      critical/serious findings** across the nine primary screens
- [x] P11 — 119 vitest + 18 E2E, **3 consecutive passes**, capstone day test, concurrency suite
      (2-connection contended + 4-process race), chaos suite (commit-fail + restore validation),
      perf harness with real numbers in `artifacts/release-2026-09-23/`
- [x] P12 — Packaging: linux-unpacked built AND runtime-smoked (cold start + sale + WAL health);
      NSIS/DMG configured but not buildable/runnable on Linux
- [~] Sync — durable outbox verified; remote transport deliberately **FEATURE ABSENT**
- [~] Physical hardware — simulator-verified, physical runtime **unverified** (no hardware here)

## Gate Results (2026-09-23, this machine)

- `npm run format:check` PASS · `lint` 0 warnings · `typecheck` strict PASS
- `npm test` 119/119 · E2E 18/18 · 3 consecutive critical runs PASS
- `npm run package:dir` → packaged `apexpos` cold-starts (1.2 s), full packaged sale, DB healthy
- `npm audit` 0 vulnerabilities
- Perf: login 29 ms · search p50 6.8 ms · dashboard 105 ms · sales summary 19.5 ms (10k products,
  20k orders) — full numbers in `artifacts/release-2026-09-23/performance/`

## What changed in this cycle (headline)

- Purchasing UI end-to-end, with WAC cost & receive idempotency
- Restaurant dine-in actually works end-to-end (was: seat-button silently failed)
- i18n wired into the shell; Urdu/RTL proven by E2E incl. sale completion in RTL
- Keyboard-only POS flow (no mouse) proven by E2E
- axe clean at WCAG A/AA automatable rules across all screens
- Multi-branch isolation hardened (register close was branch-leaky)
- Money: shift expected-cash double-count fixed; refund stock-movement for untracked items fixed;
  restored-backup integrity verified pre-swap
