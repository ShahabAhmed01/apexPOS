# APEXPOS — Build Progress

Legend: `[x]` implementation verified by tests/evidence · `[~]` partial (documented) · `[ ]` not started

Updated 2026-09-29 after the v0.2.3 full-surface UI/UX refinement cycle
(see `docs/AUDIT/UI_REFINEMENT_REPORT.md`); previous cycle 2026-09-27 live end-to-end
torture (v0.2.2, `docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`).

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
- [x] P14 — Live end-to-end torture cycle (2026-09-26 → 2026-09-27): 22 phases against the real
      Electron UI, 504 launches / 503 closes / 2,880 evidence events; new 53-test Playwright
      torture project (`tests/e2e/torture/`, separate `playwright.torture.config.ts`); 14
      defects reproduced → RED → fixed (lock wiring, double-submit, held-order lines, barcode
      search, zero-total tender, dead kitchen-fire path, waiter table permission, seeded floor
      overlap, split-bill `sort_order`, autofocus race); one defect **open** (LT-013 rare
      slow/hung Electron quit — bounded + recorded, root cause not isolated, 91 probes never
      reproduce); **175 vitest + 18 release E2E + 53 torture ×6 consecutive runs green**
- [x] P15 — UI/UX refinement cycle (2026-09-28 → 2026-09-29, v0.2.3): full-surface visual
      refinement of the renderer under a strict preservation mandate (23 files, all under
      `src/renderer`, zero functional change); token layer rebuilt (elevation/timing/overlay,
      `--color-border-strong` alpha-suffix defect fixed), primitives refined (Button/Input/
      Select/Switch/Modal + new `Badge`), every screen re-skinned (POS, floor, KDS, inventory,
      purchasing, customers, reports, settings, onboarding, palette, auth), 5 UX defects fixed
      (invisible strong borders, language-menu dismissal, RTL select chevron, RTL switch thumb,
      palette discoverability); DOM overflow audit clean in EN+Urdu at two window sizes;
      **all gates re-verified green with zero test modifications**
      (`docs/AUDIT/UI_REFINEMENT_REPORT.md`)
- [~] Sync — durable outbox verified; remote transport deliberately **FEATURE ABSENT**
- [~] Physical hardware — simulator-verified, physical runtime **unverified** (no hardware here)

## Gate Results (2026-09-29, this machine — v0.2.3)

- `npm run format:check` PASS · `lint` 0 warnings · `typecheck` strict PASS · `npm run build` ✓
- `npm test` 175/175 (24 files) · release E2E 18/18 · torture E2E 53/53 (re-run on the final
  refined state; the six consecutive green runs of v0.2.2 stand)
- DOM layout audit (EN+Urdu, 9 screens, 1280×800 + 1024×680): no overflow, no offscreen elements
- `npm run package:linux` → v0.2.3 AppImage + deb in `release/`
- `npm run package:win` → v0.2.3 NSIS setup + **portable exe** (win32 argon2 binding shipped —
  `argon2-win32-x64-msvc` verified inside `win-unpacked` asar-unpacked node_modules)
- Packaged smoke (`scripts/packaged-smoke.mjs`): cold start → interactive 1,271 ms, sale
  completes in the packaged UI, `integrity_check=ok`, `foreign_key_check` 0, WAL
- `npm audit` 0 vulnerabilities
- Perf (live torture, v0.2.2 cycle — unchanged domain; renderer only re-skinned):
  checkout p50 170 ms · seat→payment p50 152 ms · 100 search keystrokes p50 1,940 ms ·
  barcode scan p50 ~118 ms; launch p50 1,194 ms · login p50 714 ms
- Previous cycle (2026-09-27, v0.2.2): package cold-start 708 ms first paint;
  close p50 79 ms (max 30,102 ms — 4/503 bounded hangs, LT-013 open)

## What changed in this cycle (headline)

- v0.2.3 UI/UX refinement: design tokens rebuilt on a neutral-first palette with
  elevation/timing/overlay tokens; `--color-border-strong` alpha-suffix defect fixed;
  primitives refined + new `Badge`; every screen re-skinned (POS totals hierarchy, floor
  selected-state, KDS scanability, inventory data-tables, purchasing status language,
  settings form panels, onboarding progress, palette, auth screens)
- 5 UX defects fixed: invisible strong borders, language menu never dismissing,
  RTL select chevron overlap, RTL switch thumb inversion, palette discoverability
  (header `Search · Ctrl K` affordance)
- All verification gates re-run green on the refined state with **zero test modifications**;
  Windows portable exe restored to the release set

## Previous cycles (headline)

- **2026-09-27 (v0.2.2)** — 14 defects fixed by the live torture campaign
  (register: `docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`, ledgers under
  `artifacts/live-torture/run-20260926-1415/`); LT-013 remains open (bounded)

- **2026-09-26 (v0.2.1)** — 24 defects fixed from a falsification-first audit
  (`docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`): money (cart-discount bounds, refund telescoping,
  FIFO expected-cash), security (lock gates IPC, case-insensitive lockout, deactivated users
  lose privileges, branch-scoped KDS), API surface (11 read channels backed by real queries,
  15 dead write channels removed, drift guard test), per-PID temp DBs for determinism
- **2026-09-23 (v0.2.0)** — purchasing UI e2e, working dine-in, i18n/RTL, keyboard-only POS,
  axe WCAG A/AA clean, multi-branch register-close fix
