# SLOP REPORT — final anti-slop sweep (2026-09-23)

Method: same lexical + context scan as before, plus runtime sweeps (axe, E2E click-through,
sold-state reconciliation). Everything below has a disposition, not a shrug.

## Fixed (anti-slop)

| #   | Finding                                                                                               | Disposition                                                  |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| S-1 | POS advertised F9/F10/F11 but no keys were bound                                                      | Real bindings added; keyboard-only E2E                       |
| S-2 | `inventory:adjust` was dead IPC                                                                       | Full service + permission + manager PIN + audit + UI         |
| S-3 | Floor panel buttons (View/Split/Transfer/Merge/Request bill) were no-op                               | Wired to real IPC; merge/split recompute both orders' totals |
| S-4 | Language switcher mutated the DOM outside React (closed on the 1 s clock tick)                        | State-driven menu; `aria-expanded`                           |
| S-5 | `Select` implicit label polluted accessible names with every option                                   | htmlFor + id; `getByLabel` restored                          |
| S-6 | Dine-in "seat party" E2E ignored the failing IPC                                                      | openTable SQL fixed + real seat→pay→free E2E                 |
| S-7 | `electron-builder yml` wanted `~/.cache` — created a literal `~` directory in the repo                | Config corrected; artefact removed                           |
| S-8 | 68 white-on-accent/text-2 contrast violations (axe critical/serious) + 2 scroll regions not focusable | Tokens adjusted to AA; scroll regions focusable              |
| S-9 | `purchasing` backend existed with zero UI                                                             | New PurchasingScreen with supplier + PO + receive flows      |

## Known-non-slop (justified, kept)

| Finding                                                                   | Why it stays                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Math.random()` in `seed.ts` demo data                                    | Deterministic demo data is cosmetic; production never depends on it.                                |
| `card_brand = 'SIMULATED'`, approval codes `SIM-…`                        | Clearly-marked simulated payment outcome; no hardware claim.                                        |
| `console.error` inside the IPC registry error path                        | Intentional main-side logging of unhandled IPC errors (electron-log).                               |
| 77 channel constants defined in `IpcChannel`, subset currently registered | Type-safe future slots; unreachable without a handler (registry is the gate). Documented in API.md. |
| `toFixed` in reporting display                                            | Presentation-only; money is integer minor units everywhere it matters.                              |
| Sync status UI absent of false "Synced"                                   | Honest boundary; see OFFLINE_SYNC.md.                                                               |
| `products.list` N+1 on 500-row pages                                      | Measured (67 ms p50 @ 10k products), accepted as current scope; perf recorded.                      |

## Fake-functionality sweep — clean

- No fake buttons in any renderer route.
- No `TODO`/`FIXME`/`HACK`/`STUB`/`FAKE`/`COMING SOON`/`lorem`/`not implemented` in `src/`.
- No dead artists in the workspace (`~` removed; tests isolated; `artifacts/` gitignored).

---

# SLOP REPORT — live torture cycle `run-20260926-1415` (2026-09-27)

Same rule: everything below has a disposition, not a shrug. **This sweep also re-audits the
sweep above**, because live execution refuted three of its own conclusions.

## Corrections to the 2026-09-23 sweep

| #        | Prior claim                                                                                             | Live finding                                                                                                                                                                                                                                                                                               | Disposition                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **S-10** | _"No fake buttons in any renderer route"_                                                               | **False.** `Seat party of N` on the floor plan was fake for every waiter: `TablesOpen` required `tables.manage`, the promise was rejected, `FloorScreen` **discarded the rejection and navigated to `/pos` anyway** (LT-009). It looked like it worked; it never created an order.                         | Fixed: `anyOfPermissions: ['tables.manage','sales.create']` + `seatError` surfaced in `role="alert"`. Sweep line corrected below.  |
| **S-11** | _"77 channel constants … unreachable without a handler (registry is the gate)"_ — presented as harmless | True for _safety_, but it was being read as a claim of _coverage_. `OrdersFireCourse` / `OrdersItemStatus` / `KitchenRecall` were in the enum, in `PosApi`, in `preload`-adjacent docs — with **no handler, no preload binding, no UI control** (LT-008). KDS could never show a ticket created by a user. | Implemented end-to-end + regression test. Declaration ≠ implementation; a channel is only real once the UI can reach it.           |
| **S-12** | Floor split/transfer/merge _"wired to real IPC"_ (S-3)                                                  | True of the wiring, false of the _ease of reaching it_: the specs that exercised it could not pass, and `sale-flow.spec.ts:45` used `click({ force: true })` on a tile physically covered by another (LT-011).                                                                                             | Seed layout fixed; the torture suite clicks P-1/P-2 with no force. **Every remaining `force: true` is now on the recon hit-list.** |

## Fixed (anti-slop) this cycle

| #        | Finding                                                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-13** | Three `03-restaurant` specs asserted emoji the floor never renders, targeted a **phantom open-table dialog**, passed `selectOption({ value: 'T-4' })` when the real values are UUIDs, and read `window.api.floors.tables()` as a bare array instead of an `IpcResult`       | Rewritten against the real UI (aria-label tiles, detail panel, real transfer modal, `.data` unwrapping). Coverage they claimed now exists.                                  |
| **S-14** | `branch scope: KDS only shows tickets for the user branch` was a `TODO` stub whose body only called `closeApp()` — **asserted nothing** and was counted in the test total                                                                                                   | **Removed** (disclosed in `LIVE_TORTURE_TEST_REPORT.md` §K). Replaced by 3 real tests: floor-overlap, kitchen-role nav, manager/waiter race. Suite 51 → 53.                 |
| **S-15** | LT-008 / LT-009 / LT-010 were dispositioned **"DEFERRED — test design issue"** — a plausible label that parked three real defects                                                                                                                                           | **Retracted** in superseding ledger records (`correction: … prior disposition … retracted`). Two were pure product defects; LT-010 was product (`moveLines`) _and_ harness. |
| **S-16** | `typecheck` was claimed green in prior reports but was **42 errors** when this cycle began — including a real typing bug (`getModifiers` declared `LineRow[]`) introduced by LT-004's own fix                                                                               | Fixed properly (`ModifierRow` interface), not by casting or relaxing `strict`. Now **0 errors × 3 projects**.                                                               |
| **S-17** | Harness had **unbounded waits**: Playwright's action timeout defaults to `0` (wait forever) and `ElectronApplication.close()` has no timeout option. A 30-second slow quit therefore surfaced as an anonymous `Test timeout of 240000ms exceeded` on an unrelated assertion | Explicit timeouts on `launchT`/`firstWindow`/`login`/`closeApp` + `page.setDefaultTimeout(30_000)` + stage markers in `events.jsonl`. Failures now **name their stage**.    |
| **S-18** | `defects.jsonl` carried LT-002 twice, one record missing `status`; three records missing `status` overall                                                                                                                                                                   | Left in place (append-only ledger) — later records carry explicit `status`; the convention is documented so a reader is never misled by a stale record.                     |

## Known-non-slop (added this cycle)

| Finding                                                                         | Why it stays                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LT-013 recorded **OPEN** with root cause explicitly _not isolated_              | Closing it with a plausible guess would be the exact slop this document exists to prevent. Evidence: 503 closes + 91 controlled probes.                                            |
| The no-op stub was **deleted, and the deletion disclosed**                      | Deleting an assertion-free test cannot weaken coverage — but silently shrinking the suite would be slop, so the removal is named with its replacement.                             |
| `click({ force: true })` left in `sale-flow.spec.ts:45`                         | Removing it would change a passing _release_ test that this cycle did not own. It is no longer load-bearing (seed fixed) and is listed as a known gap rather than quietly changed. |
| Separate `playwright.torture.config.ts` with `testIgnore` on the release config | A torture suite that could fail a release run would be ignored, not run. Making it a real, independently runnable gate is the non-sloppy choice.                                   |

## Fake-functionality sweep — corrected

- No fake buttons remain in any renderer route **after LT-009** (`Seat party of N` is now real for
  waiters and cashiers, and its failure mode is visible instead of silent).
- No `TODO`/`FIXME`/`HACK`/`STUB`/`FAKE`/`COMING SOON`/`lorem`/`not implemented` in `src/` (re-swept).
- **No assertion-free tests remain** in `tests/e2e/` (the one stub was removed — S-14).
- `click({ force: true })`: **1 occurrence** remains (`tests/e2e/sale-flow.spec.ts:45`), documented
  as a known gap rather than treated as clean.
