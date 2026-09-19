# SLOP REPORT — Anti-slop sweep 2026-09-19

Method: repo-wide lexical scan (excluding node_modules/out/release) + manual context
inspection. Terms: TODO/FIXME/XXX/HACK/STUB/DUMMY/PLACEHOLDER/COMING SOON/NOT IMPLEMENTED/
MOCK/FAKE/lorem/hardcoded/`return true` shells/console.log/debugger/as any/@ts-ignore.

## Findings — resolved

| #   | Finding                                                                                   | Disposition                                                       |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Hardcoded 18% tax in `computeTotals.ts` + `taxBps: 1800` in cartStore + "Tax (18%)" label | **FIXED** — shared pricing engine + per-product tax rate          |
| 2   | `Math.random` card approval codes in `paymentService.ts`                                  | **FIXED** — deterministic SIM reference                           |
| 3   | Placeholder register writes (`void remaining` etc. after tender)                          | Removed while fixing cash under-tender                            |
| 4   | Broken `dom` vitest project + missing `tests/setup.dom.ts`                                | **FIXED** — setup + Button component tests added (61 total tests) |
| 5   | Doc/impl mismatches (SECURITY/ARCHITECTURE/DATABASE/README/CHANGELOG↔PROGRESS)            | **FIXED** — texts now match code                                  |

## Findings — legitimate, kept with justification

| #   | Finding                                                      | Classification                                                                                                                  |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `hardwareService.ts` "adapter stub" comment                  | Legitimate simulator: produces real 42-col receipt text, job log, state transitions; labeled simulated. No fake-success claim.  |
| 2   | `seed.ts` Math.random for demo barcodes/stock                | Test/demo data only; production never depends on it. Non-determinism documented as cosmetic; could be made deterministic later. |
| 3   | `toFixed` in InventoryScreen/SettingsScreen (display %)      | Presentation-only formatting, not financial storage.                                                                            |
| 4   | `console.error` in `registry.ts` error path                  | Structured error envelope still returned to renderer; main-side error logging is intended (electron-log available).             |
| 5   | 88 channel constants without handlers incl. preload wrappers | Dead API surface, not dead UI. No renderer route/button calls into them. Documented in RECON; future phases own them.           |
| 6   | Demo credentials + PIN `1234`                                | Clearly documented as seed/demo only.                                                                                           |

## Fake-functionality sweep

- No fake buttons or dead onClick handlers in renderer routes (each control wires to a real IPC handler or local state).
- Dashboard/reports read live aggregates from SQLite (no hardcoded numbers).
- No "coming soon" screens, no lorem ipsum, no placeholder production data.
- Sync status UI is honest: channels exist but nothing publishes status — no false "Synced" claims.
