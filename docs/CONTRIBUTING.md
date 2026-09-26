# Contributing

## Ground rules

- **Tests first for money, stock, permissions, and branches.** Any change to the following
  should come with a test that FAILS without it:
  payments/refunds, inventory ledger, gift-cards/store-credit/loyalty, purchasing receive,
  register cash, IPC permission wiring, branch scoping.
- **Adversarial suites are load-bearing.** `tests/integration/adversarial-*.test.ts` and
  `tests/unit/money-fuzz.test.ts` exist because specific defects were proven RED in them —
  never delete, skip, or weaken them to make a change pass. If a fix genuinely changes
  intended behavior, update the test in the same commit with the reasoning.
- **Never claim from cosmetics.** A change is done when its tests, E2E, and reconciliation
  match the claim in the docs. See `docs/AUDIT/REPORT.md` for the standard we hold.
- **No silent failures.** Errors must be deliberate (`AppError` with a code) — never
  swallowed, never a bare `TypeError`.
- **Deterministic artifacts.** `Math.random`/`Date.now` have no place in financial flows —
  use UUIDs and service timestamps.
- **Honest sync/hardware.** If a transport or device doesn't exist, say so. The user can
  handle an honest "local only" label; they cannot handle a fake "Synced".

## Development loop

```bash
npm install
npm run build          # renderer+main+preload (electron-vite)
npm test               # 175+ integration/unit/component tests (incl. adversarial suites)
npm run test:e2e       # real Electron, hermetic profiles
npm run lint && npm run typecheck && npm run format:check
```

Working on a windowing issue? `npm run package:dir` and run the unpacked binary — dev-time
`electron-vite dev` is not a substitute (it creates nodes/dirs differently).

## IPC checklist (new channel)

1. `IpcChannel.X` constant.
2. Zod schema in the matching `register*.ts` file; permission (`PERMISSION_GROUPS` key) or
   `requiresAuth`.
3. Typed wrapper in `src/shared/ipc/api.ts` + `src/preload/index.ts`.
4. Service keeps the business invariant; the IPC handler is a thin schema+permission shell.
5. Add it to `docs/API.md` (that table reflects registrations — update it in the same PR).

## DB migrations

Append — never rewrite — in `src/main/db/migrator.ts`. A migration is followed by a
`packages:` verification that an OLD DB upgrades cleanly.

## Code style

Prettier + ESLint gates (`format:check`, `lint`) must pass. Money = integer minor units via
`@shared/lib/money`. Quantities = integer milli-units via `@shared/lib/quantity`.
