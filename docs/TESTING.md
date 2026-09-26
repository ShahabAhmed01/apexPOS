# Testing

## Layers

| Layer         | Tool                             | Path                                                          | Scope                                                                                                                                |
| ------------- | -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unit          | Vitest (node)                    | `tests/unit/`                                                 | `money`, `pricing`, `quantity`, `money-fuzz` (205k-case property/fuzz)                                                               |
| Integration   | Vitest (node, real SQLite files) | `tests/integration/`                                          | services directly, disposable DBs under `/tmp/opencode/apex-*`; includes `adversarial-money` / `-security` / `-ipc` / `-concurrency` |
| Component     | Vitest (jsdom)                   | `tests/component/`                                            | design-system primitives                                                                                                             |
| E2E           | Playwright + Electron            | `tests/e2e/`                                                  | real app binary, hermetic data + user-data dirs                                                                                      |
| Perf          | Vitest (env-gated)               | `tests/integration/perf.test.ts` + `scripts/perf-startup.mjs` | measured timings → `artifacts/<run>/performance/`                                                                                    |
| Accessibility | Playwright + axe-core            | `tests/e2e/a11y-keyboard.spec.ts`                             | WCAG 2 A/AA automatable rules + keyboard-only flow                                                                                   |
| Package smoke | plain Node script                | `scripts/packaged-smoke.mjs`                                  | launches the `electron-builder --dir` binary                                                                                         |

## Commands

```bash
npm test                 # all unit + integration + component (Vitest)
npm run test:unit        # node project only
npm run test:dom         # jsdom components
npm run test:coverage    # v8 coverage → coverage/
npm run test:e2e         # Playwright/Electron (requires prior `npm run build`)
APEXPOS_PERF=1 npx vitest run tests/integration/perf.test.ts
node scripts/perf-startup.mjs       # built-app cold/warm startup timings
node scripts/critical-runs.sh 3     # vitest + e2e, three consecutive runs
```

## E2E conventions

- Every spec launches a **hermetic** Electron instance: fresh `APEXPOS_DATA_DIR` (SQLite,
  backups) _and_ fresh Chromium `--user-data-dir` (localStorage) per describe block.
  Never share them between specs — cross-test language settings leaking through persisted
  localStorage was a real bug found this way.
- `APEXPOS_SEED_DEMO=1` gives the demo catalog; without it the app correctly boots into the
  onboarding wizard.
- `APEXPOS_AXE=1` lazy-loads axe-core into the renderer (extra chunk; never loaded in
  normal boot). The axe test includes a fail-safe: it first proves the harness detects a
  deliberately injected violation, so a green run is not green-by-accident.
- Keyboard-only POS: the sale flow (`login → search → Enter adds → F9 cash`) is exercised
  with zero `page.click` mouse usage.

## Integration conventions

- Each suite opens its own file-backed DB via `tests/helpers/rig.ts` — never `:memory:`-share
  between suites, never assume seed order beyond what the suite created itself.
- `beforeCommit(label)` test hooks on `PaymentService` / `PurchaseService` inject crash points
  _inside_ the transaction (chaos suite + concurrency interleave). Production behavior
  unchanged — the hook is only invoked when passed.
- Concurrency is verified two ways: (a) deterministic two-connection lock contention with the
  loser retrying after resolution, and (b) genuine multi-process races (`RACE-011`) via child
  `node` processes hammering one SQLite file.
- Reconciliation is INDEPENDENT of services: golden values are computed in the test and proven
  against raw SQL (`capstone.test.ts` simulates a full business day and proves every ledger).

## Adversarial suites

Falsification-first suites written RED (failing) against real defects, then kept green as
regression locks — each defect's record lives in `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md` and
`artifacts/<run>/defects/defects.json`:

- `adversarial-money` — discount bounds, whole-unit quantities, modifier price tampering,
  refund exactness (telescoping pro-ration), gift-card over-tender, expected-cash oracle,
  same-timestamp allocation determinism.
- `adversarial-security` — lock gating IPC, lockout case variants, deactivated-user
  privileges, cross-branch scope (orders/tables/KDS), restaurant state machine, audit actor
  attribution, gift-card expiry.
- `adversarial-ipc` — the REAL handler registry with mocked transport: every registered
  channel fuzzed with malicious payload classes (unauthenticated + low-privilege), permission
  probes, path-traversal/SQLi/XSS payloads, and a dead-channel guard (preload surface ⊆
  registered handlers).
- `adversarial-concurrency` — duplicate `clientOpId` raced across two connections inside a
  commit window; a 4-process race opening one restaurant table.
- `money-fuzz` — ~205k deterministic cases (seeded LCG) against an independent integer
  oracle for money primitives, splits/allocations, and `priceOrder` invariants.

## Mutation sensitivity

Suites are written to fail without the protection they claim. Example: deleting the
branch guard in `RegisterService.close` makes `multibranch.test.ts` fail — and this was
proven by reverting the guard and observing the failure, then restoring it.
