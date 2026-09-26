# APEXPOS — Build Progress

Legend: `[x]` implementation verified by tests/evidence · `[~]` partial (documented) · `[ ]` not started

Updated 2026-09-26 after the phase-3 adversarial hardening cycle (see `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`).

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
- [x] P11 — capstone day test, concurrency suite (2-connection contended + 4-process race),
      chaos suite (commit-fail + restore validation), perf harness with real numbers
- [x] P12 — Packaging: linux-unpacked built AND runtime-smoked (cold start + sale + WAL health);
      NSIS/AppImage/deb cross-built from Linux (win32 argon2 binding shipped); DMG not buildable
      here
- [x] P13 — Phase-3 adversarial hardening (2026-09-26): 24 defects found RED-first and fixed
      (cart-discount bounds, modifier price tampering, refund exactness/telescoping, gift-card
      over-tender + expiry, lock gating IPC, branch-scoped KDS, restaurant FSM, idempotent
      duplicate submissions, deterministic refund allocation, dead preload surface removed,
      receipt identity/sanitization); 4 new adversarial suites + 205k-case money fuzz;
      **175 vitest + 18 E2E ×3 consecutive runs green**
- [~] Sync — durable outbox verified; remote transport deliberately **FEATURE ABSENT**
- [~] Physical hardware — simulator-verified, physical runtime **unverified** (no hardware here)

## Gate Results (2026-09-26, this machine — v0.2.1)

- `npm run format:check` PASS · `lint` 0 warnings · `typecheck` strict PASS
- `npm test` 175/175 · E2E 18/18 · **3 consecutive critical runs PASS** (see
  `artifacts/run-20260925-181543/critical/`)
- `npm run package:dir` → packaged `apexpos` cold-starts (708 ms first paint / 855 ms
  interactive), full packaged sale, `integrity_check` ok, FK violations 0
- `npm audit` 0 vulnerabilities
- Perf: login 29 ms · search p50 6.8 ms · dashboard 105 ms · sales summary 19.5 ms (10k products,
  20k orders) — full numbers in `artifacts/release-2026-09-23/performance/`

## What changed in this cycle (headline)

- 24 defects fixed from a falsification-first audit (register: `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`)
- Money: cart discounts bounded (no negative totals), refund pro-ration telescopes to the exact
  line total, split-tender expected-cash computed by deterministic FIFO replay
- Security: app lock now gates IPC (was UI-cosmetic), case-insensitive login lockout,
  deactivated users lose privileges immediately, kitchen board branch-scoped
- API surface: 11 safe read/report channels backed by real queries (receipt, cancel-held,
  payments:recent, x/z reports, audit, taxes/discounts/modifiers lists, users/roles lists) and
  15 never-implemented write channels removed from preload + types + docs (26 dead channels
  total; a guard test now fails if preload and registrations drift apart)
- Test determinism: per-PID temp DB paths (no cross-run interference)
- Previous cycle (2026-09-23): purchasing UI e2e, working dine-in, i18n/RTL, keyboard-only POS,
  axe WCAG A/AA clean, multi-branch register-close fix
