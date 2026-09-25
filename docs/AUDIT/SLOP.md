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
