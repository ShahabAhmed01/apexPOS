# PROGRESS — live torture campaign `run-20260926-1415`

Status roll-up. Every row is backed by an artifact under
`artifacts/live-torture/run-20260926-1415/`.

**Final status: READY FOR VERIFICATION**

---

## Gates (last execution, 2026-09-27)

| Gate             | Command                 | Result                                    | State |
| ---------------- | ----------------------- | ----------------------------------------- | ----- |
| Format           | `npm run format:check`  | All matched files use Prettier code style | ✅    |
| Lint             | `npm run lint`          | 0 problems                                | ✅    |
| Typecheck        | `npm run typecheck`     | 0 errors × 3 projects (node/web/tests)    | ✅    |
| Build            | `npm run build`         | electron-vite ✓ built in 11.42 s          | ✅    |
| Unit/integration | `npx vitest run`        | **175 / 175**, 24 files, 28.32 s          | ✅    |
| Release E2E      | `npx playwright test`   | **18 / 18**, 1.1 m                        | ✅    |
| Torture campaign | `npm run test:torture`  | **53 / 53**, 2.6 m, `flaky 0`             | ✅    |
| Packaging        | `npm run package:linux` | v0.2.2 AppImage + deb in `release/`       | ✅    |

The last row and the re-run of all gates above are the **v0.2.2 release verification**
(`results.jsonl` → `verify-v022`): the 6th consecutive green full torture run.

---

## Phase timeline

| Phase                       | State   | Result                                                                                                                                                                                                                                    |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Baseline**            | ✅ done | 51 tests → **33 pass / 18 fail**; 12 defects opened; `PHASE1_BASELINE.md`                                                                                                                                                                 |
| **2 — Triage + fix**        | ✅ done | LT-001…LT-006 product fixes; LT-007 re-scoped (test pollution); every fix has a RED→GREEN regression                                                                                                                                      |
| **3 — Campaign re-run**     | ✅ done | 3 consecutive runs, identical **43 pass / 8 fail** → the 8 were deterministic, not flaky                                                                                                                                                  |
| **4 — Escalate until stop** | ✅ done | 12 campaign runs; LT-008/009/010 proven real (earlier "DEFERRED" verdicts retracted) and fixed; LT-011, LT-012, LT-013, LT-014 discovered and handled; loop terminated after 5 consecutive green runs (6th = v0.2.2 release verification) |
| **5 — Reporting**           | ✅ done | `LIVE_TORTURE_TEST_REPORT.md` (A–T), `EXHAUSTIVE_TEST_REPORT.md`, `RECON.md`, `SLOP.md`, `REPORT.md`, `PROGRESS.md`                                                                                                                       |

---

## Defects

| ID     | Severity      | Title                                                        | Status                                                                                                   |
| ------ | ------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| LT-001 | CRITICAL      | UI lock never invalidated the main-process session           | ✅ FIXED                                                                                                 |
| LT-002 | CRITICAL      | Charge double-submit → 2 orders / 2 payments                 | ✅ FIXED                                                                                                 |
| LT-003 | HIGH          | Hold double-submit                                           | ✅ FIXED                                                                                                 |
| LT-004 | HIGH          | Recall returned an empty cart                                | ✅ FIXED                                                                                                 |
| LT-005 | HIGH          | Barcode scanner wedge / wrong product added                  | ✅ FIXED                                                                                                 |
| LT-006 | MEDIUM        | 100 % discount could not complete                            | ✅ FIXED                                                                                                 |
| LT-007 | HIGH          | `TablesOpen` lost `table_id` / `client_op_id`                | ✅ RESOLVED (test pollution)                                                                             |
| LT-008 | HIGH          | KDS fire/recall was a dead end-to-end surface                | ✅ FIXED _(supersedes wrong "DEFERRED")_                                                                 |
| LT-009 | HIGH          | Waiter could not seat a table; failure silent                | ✅ FIXED _(supersedes wrong "DEFERRED")_                                                                 |
| LT-010 | HIGH          | Transfer / split / merge never exercised                     | ✅ FIXED, product + harness _(supersedes wrong "DEFERRED")_                                              |
| LT-011 | MEDIUM        | Seeded Patio tiles overlapped Hall tiles → unclickable       | ✅ FIXED                                                                                                 |
| LT-012 | LOW           | `moveLines` kept stale `sort_order` → non-deterministic bill | ✅ FIXED                                                                                                 |
| LT-013 | LOW           | Electron quit occasionally slow / never completes            | ⚠️ **OPEN** — bounded + logged, root cause not isolated (4th observation in the v0.2.2 verification run) |
| LT-014 | LOW (harness) | Barcode specs raced the POS mount autofocus                  | ✅ FIXED (test design)                                                                                   |

**13 / 14 closed. 1 open — deliberately not closed with a guess.**

---

## Campaign run ledger (abridged)

| #               | Tests  | Pass   | Fail  | Note                                          |
| --------------- | ------ | ------ | ----- | --------------------------------------------- |
| phase1          | 51     | 33     | 18    | baseline                                      |
| phase3 ×3       | 51     | 43     | 8     | identical all three times (determinism proof) |
| p4-03-1         | 11     | 7      | 4     | harness contract bugs                         |
| p4-03-2         | 12     | 11     | 1     | LT-012 found by a new assertion               |
| p4-03-3         | 12     | 12     | 0     | —                                             |
| p4-c1           | 53     | 53     | 0     | first green                                   |
| p4-c2           | 53     | 53     | 0     | confirmation                                  |
| p4-c3           | 53     | 52     | 1     | LT-013 (unbounded `close()`)                  |
| p4-c4           | 53     | 53     | 0     | after bounding + instrumentation              |
| p4-c5           | 53     | 52     | 1     | LT-014 (autofocus race)                       |
| p4-c6 / c7 / c8 | 53     | 53     | 0     | ×3 confirmations                              |
| **final**       | **53** | **53** | **0** | `expected 53, unexpected 0, flaky 0`          |
| verify-v022     | 53     | 53     | 0     | v0.2.2 release gates (6th green run)          |

Full detail: `results.jsonl` (23 records).

---

## Coverage delivered

- **53** real-Electron torture tests (login/session/roles, POS sale, restaurant/KDS/concurrency)
- **18** release E2E tests (unchanged, still green)
- **175** unit/integration tests against real SQLite
- **504** real app launches instrumented (`events.jsonl`, 2 880 records)
- **93** performance samples across 4 metrics
- **91** controlled shutdown probes across 7 load modes
- **15** screenshots of live UI states

---

## Known gaps (carried forward, not hidden)

1. **LT-013** — intermittent slow/hung quit. Bounded at 30 s + SIGKILL, every occurrence logged.
   91 controlled probes across 7 load modes do not reproduce it. Needs a soak under sustained load.
2. **No physical hardware** (receipt printer, kitchen printer, cash drawer, barcode scanner as a
   HID device). The scanner wedge path is exercised with synthetic keystrokes; hardware timing
   cannot be reproduced here.
3. **No cloud sync transport** — offline outbox is exercised up to the transport boundary only.
4. **`tests/e2e/sale-flow.spec.ts:45` still carries `click({ force: true })`** on P-1. It is no
   longer load-bearing (LT-011 fixed at the seed), and the torture suite clicks P-1/P-2 without
   force; removing it from the release spec would change a passing release test and is left for
   the verifier to decide.

---

## Git

- Released as **v0.2.2**: the whole cycle (17 modified files + `playwright.torture.config.ts`,
  `tests/e2e/torture/`, this report set) was committed in **one commit** and pushed to
  `origin/main`. During the campaign itself `HEAD` stayed at the Phase 1 baseline `ab76626` so
  no evidence could be confused with a commit.
- **No history rewrite, no force push.** `artifacts/` stays gitignored by repo policy.
