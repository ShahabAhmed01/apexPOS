# APEXPOS — Build Progress

Legend: `[x]` implementation verified by tests/evidence · `[~]` partial (documented) · `[ ]` not started

Updated 2026-09-27 after the live end-to-end torture cycle (v0.2.2, see
`docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`); previous cycle 2026-09-26 phase-3 adversarial
hardening (see `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`).

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
- [~] Sync — durable outbox verified; remote transport deliberately **FEATURE ABSENT**
- [~] Physical hardware — simulator-verified, physical runtime **unverified** (no hardware here)

## Gate Results (2026-09-27, this machine — v0.2.2)

- `npm run format:check` PASS · `lint` 0 warnings · `typecheck` strict PASS · `npm run build` ✓
- `npm test` 175/175 (24 files) · release E2E 18/18 · **torture E2E 53/53 (unexpected 0,
  flaky 0), 6 consecutive green runs** (see `artifacts/live-torture/run-20260926-1415/`)
- `npm run package:linux` → v0.2.2 AppImage + deb in `release/`
- `npm audit` 0 vulnerabilities
- Perf (live torture): checkout p50 170 ms · seat→payment p50 152 ms · 100 search keystrokes
  p50 1,940 ms · barcode scan p50 ~118 ms; launch p50 1,194 ms · login p50 714 ms ·
  close p50 79 ms (max 30,102 ms — 4/503 bounded hangs, LT-013)
- Previous cycle (2026-09-26, v0.2.1): package cold-start 708 ms first paint; perf harness
  numbers in `artifacts/release-2026-09-23/performance/`

## What changed in this cycle (headline)

- 14 defects found by a live end-to-end torture campaign and fixed RED-first
  (register: `docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`, ledgers under
  `artifacts/live-torture/run-20260926-1415/`)
- Kitchen fire path wired end-to-end: `sendToKitchen` service + `OrdersFireCourse` /
  `OrdersItemStatus` / `KitchenRecall` IPC + preload/types + POS "Send to kitchen" button
- Waiters can open tables (`TablesOpen` accepts `tables.manage` **or** `sales.create`) and
  `FloorScreen` surfaces `seatError` instead of swallowing a rejected promise
- Split bill: `moveLines` re-sequences `sort_order` on the target order; Patio zone seeded
  clear of the hall tiles (clickable overlap)
- Held orders restore lines + modifiers; zero-total checkout tendered cleanly; barcode/Enter
  search heuristic + `barcode LIKE`; double pay/hold submit blocked by `isProcessingRef`;
  app-lock button actually awaits the `AppLock` IPC
- Test harness hardened: every launch/login/close bounded (30–60 s) with stage timings in
  `events.jsonl`; shutdown probes (91 closes × 7 modes) — 0 repros, LT-013 stays open

## Previous cycles (headline)

- **2026-09-26 (v0.2.1)** — 24 defects fixed from a falsification-first audit
  (`docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`): money (cart-discount bounds, refund telescoping,
  FIFO expected-cash), security (lock gates IPC, case-insensitive lockout, deactivated users
  lose privileges, branch-scoped KDS), API surface (11 read channels backed by real queries,
  15 dead write channels removed, drift guard test), per-PID temp DBs for determinism
- **2026-09-23 (v0.2.0)** — purchasing UI e2e, working dine-in, i18n/RTL, keyboard-only POS,
  axe WCAG A/AA clean, multi-branch register-close fix
