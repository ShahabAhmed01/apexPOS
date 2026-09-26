# FINAL AUDIT REPORT — APEXPOS (Phase 2 completion)

Date: 2026-09-23 · Commit basis: `25bd351` + this cycle's working tree ·
Run id: `release-2026-09-23`

## 1. Executive verdict

**VERIFIED for all in-scope, environment-possible requirements** — with two deliberate
exceptions that are FEATURE ABSENT by design, not hidden failure:

- Physical hardware verification (no hardware exists here — see HARDWARE.md)
- Cloud sync transport (no central server exists here — see OFFLINE_SYNC.md)

Everything else — financial integrity, offline-first core, purchasing end-to-end, onboarding,
multi-branch isolation, concurrency, chaos/recoverability, accessibility, packaging, and docs —
has unit, integration, E2E, and/or packaged-runtime evidence in `artifacts/release-2026-09-23/`.

## 2. Gates (all real, all green)

| Gate                                     | Result                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run format:check`                   | PASS                                                                                    |
| `npm run lint`                           | 0 warnings                                                                              |
| `npm run typecheck`                      | strict, three projects (node/web/tests)                                                 |
| `npm test`                               | **119/119**                                                                             |
| `npm run test:e2e`                       | **18/18** (real Electron, hermetic profiles)                                            |
| `npm run critical-runs` × 3 consecutive  | **119/119 + 18/18**, three times                                                        |
| `npm run package:dir`                    | `release/linux-unpacked` built                                                          |
| packaged binary cold-start→login→sale→DB | PASS (1196 ms interactive, WAL, ok integrity)                                           |
| `npm audit`                              | 0 vulnerabilities                                                                       |
| `npm run test:coverage`                  | services 82.5% lines; payments 97%, purchasing 95.5%, sync 100%, money 96%, pricing 92% |

## 3. New verification surfaces added this cycle

- **Purchase lifecycle suite** (`purchasing.test.ts`, 7 tests): validation, draft→sent→partial→
  received, over-receive rebound, idempotent receive, WAC costing, cancel rules, audit.
- **Multi-branch suite** (`multibranch.test.ts`, 5 tests): orders/POs/shifts/tables cross-branch
  denied; shift close across branches rejected. The register-close guard is mutation-proven.
- **Concurrency suite** (`concurrency.test.ts`, 9 tests):
  RACE-001 stock race · RACE-002 sale+receive · RACE-003 double refund ·
  RACE-004 gift-card double-spend · RACE-005 store-credit double-spend ·
  RACE-006 order numbers · RACE-008 table transfer under lock contention ·
  RACE-009 close+sale · RACE-010 outbox replay (idempotent)
  and RACE-011 — **four OS processes** racing a gift card through guarded transactions;
  exactly 50 units redeemable, zero overspend, ledger balanced.
- **Chaos suite** (`chaos.test.ts`, 8 tests): crash at tender commit ⇒ nothing persists;
  crash at refund commit ⇒ quantities/balances/payment-tracking unchanged; crash at PO
  receive ⇒ no partial stock; closed DB + reopen ⇒ order survives payment replay;
  corrupt/foreign backup refused with integrity+FK reasons; migrations idempotent; FK on.
- **Restaurant suite** (`restaurant.test.ts`, 8 tests): seat→add→transfer→split→merge→
  close-empty voids, close-unpaid rejected, cross-branch denied, RACE-008 lock contention.
- **Capstone day** (`capstone.test.ts`): open ₨20,000.00 float → mixed retail (cash, card,
  split tender, gift card, store credit, discounts), declines, holds, recalls, voids,
  refunds to every settlement type, purchasing receive, stock adjustments, pay in/out,
  loyalty, loyalty/gift-card/store-credit ledger reconciliation, deliberate −₨50.00 close
  variance, then backup → mutate → restore → re-reconcile. All independent-SQL verified.
- **Accessibility** (`a11y-keyboard.spec.ts`): axe-core WCAG 2 A/AA across 9 screens, plus a
  sanity probe proving the harness detects an injected violation, plus one complete
  keyboard-only sale (login → F2 search → Enter add ×2 → F9 cash → receipt).
- **RTL**: switch EN→UR flips `document.dir`, cart state survives, numbers stay LTR, sale
  completes RTL-active; switch back.
- **Perf** (`perf.test.ts`, env-gated): 10k products + 20k orders. Numbers in
  `artifacts/release-2026-09-23/performance/`. Highlights: p50 login (argon2) 29 ms,
  search 6.8 ms, dashboard 105 ms, sales summary 19.5 ms, startup (built app) 873 ms cold.

## 4. Defect ledger (this cycle)

D-15…D-32 — see `RECON.md` "Found & fixed THIS cycle". Every fix has a failing-first test,
and the money-path ones are re-verified in the 3× critical runs.

## 5. Security (honest)

- CSP hardened (`script-src 'self'`, no inline), contextIsolation ON, sandboxed renderer,
  navigation locked, window-open denied, cert errors rejected.
- IPC registry is fail-closed; overrides rate-limited; audited fail-closed too.
- No on-disk encryption (OS-level secret storage is out of scope for this desktop milestone);
  Argon2id (m=19 MiB, t=2, p=1); session lockout; no dead IPC reachable without permission.

## 6. Accessibility (honest)

- axe.automatable: **0 critical/serious** across all screens; minor/best-practice items remain
  (documented in `docs/AUDIT/SLOP.md` style).
- Keyboard: full sale proven without the mouse; focus states preserved; dialogs trap focus
  (Radix) and restore on close.
- Manual WCAG (reduced-motion, SR journeys, complex widgets) — code-verified; no external
  certify claim.

## 7. Database reconciliation

- Migrations 0001+0002 in a `migrations` table; re-runs are no-ops.
- integrity_check `ok`; foreign_key_check `0`. WAL + busy_timeout + synchronous=NORMAL.
- Every financial table reachable from the suite is reconciled against an independent golden
  ledger in the capstone (orders/payments/refunds/cash/GC/SC/loyalty/stock/audit/variance).

## 8. Final statement

Scope-complete and verified against real evidence for everything this environment can prove.
Ready for external review + hardware sign-off on a device-equipped station.

**Status: VERIFIED** (scope: implemented, tested, packaged Linux; hardware & cloud sync
explicitly FEATURE ABSENT/unverified-by-environment, not claimed).

---

# SUPERSEDED — live torture cycle `run-20260926-1415` (2026-09-27)

> **The `Status: VERIFIED` verdict above is withdrawn.** It was earned against evidence that a
> subsequent live torture campaign falsified. Nothing in §1–§8 has been edited; the correction is
> appended here so the record of what was claimed — and why it did not hold — stays intact.

## 9. Why "VERIFIED" did not hold

| Prior claim (2026-09-23)                                                                       | Live finding (2026-09-26/27)                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §5: _"no dead IPC reachable without permission"_ + DEF-001 _"lock screen UI-cosmetic — fixed"_ | **LT-001 (CRITICAL)**: the lock **button** still only mutated renderer state; it never called `window.api.app.lock()`, so the main-process session stayed authorized. DEF-001 fixed the mechanism, not the caller. Fixed this cycle + `probe-lock.spec.ts`.                    |
| §8 / SLOP: _"No fake buttons in any renderer route"_                                           | **LT-009 (HIGH)**: `Seat party of N` silently failed for every waiter (over-privileged gate + swallowed rejection).                                                                                                                                                            |
| SLOP: _"77 channel constants … unreachable without a handler"_ treated as harmless             | **LT-008 (HIGH)**: `OrdersFireCourse` / `OrdersItemStatus` / `KitchenRecall` were declared and typed with no handler — KDS fire/recall was unreachable from the UI.                                                                                                            |
| §7 / SLOP: floor split/transfer/merge _"wired to real IPC"_                                    | **LT-010 / LT-011 / LT-012**: the specs that exercised it could not pass (phantom dialog, non-UUID option values, unwrapped `IpcResult`), a seeded table was physically covered by another (`force: true` hiding it), and `moveLines` produced a non-deterministic bill order. |
| Gates green                                                                                    | `typecheck` was **42 errors** when the cycle began — including a real typing bug introduced by LT-004's own fix.                                                                                                                                                               |

Six of the twelve Phase 1 defects were **regressions of, or failures to actually wire, fixes
previously declared complete.** That is precisely what an assertion-free stub, a `force: true`
click, and a "declared = implemented" reading of the channel enum buy you.

## 10. Where the audit stands now

|                                   |                                                                |
| --------------------------------- | -------------------------------------------------------------- |
| Torture campaign                  | **53 / 53**, six consecutive green runs, `flaky 0`             |
| Release E2E                       | **18 / 18**                                                    |
| Vitest                            | **175 / 175** (24 files)                                       |
| format / lint / typecheck / build | **all clean**                                                  |
| Defects                           | 14 IDs — **13 fixed or resolved, 1 open (LT-013)**             |
| Git                               | `HEAD` = `ab76626`, **unchanged**; nothing committed or pushed |

**Status: READY FOR VERIFICATION** — not _VERIFIED_, because LT-013 (intermittent slow/hung
Electron quit) is recorded **OPEN with root cause not isolated** after 91 controlled reproduction
attempts, and because this cycle has already demonstrated once that a "VERIFIED" declared on the
previous evidence base does not survive contact with a real live run.

Verification instructions: see `LIVE_TORTURE_TEST_REPORT.md` §T.
