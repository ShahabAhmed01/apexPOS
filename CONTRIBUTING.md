# Contributing to APEXPOS

Thank you for considering a contribution to APEXPOS — an offline-first hybrid Retail + Restaurant desktop POS built with Electron, React 19, TypeScript, and SQLite.

This is a mature, test-heavy project. Contributions are welcome, but the bar for correctness is high because the software handles money, inventory, and role-based access control.

## How to contribute

1. **Fork the repository** and create a feature branch from `main`.
2. **Set up the development environment** (see Development setup below).
3. **Make your change** with tests. Money, stock, permissions, and branch-scoping changes must include a test that fails without the fix.
4. **Run the checks**: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`.
5. **Open a pull request** against `main`. Use the pull request template.

## Development setup

```bash
# Prerequisites: Node 20+, npm
git clone https://github.com/ShahabAhmed01/apexPOS.git
cd apexPOS
npm ci
npm run build          # renderer + main + preload
npm test               # 175+ unit + integration tests
npm run test:e2e       # real Electron E2E (needs a display; use xvfb-run on Linux)
npm run lint && npm run typecheck && npm run format:check
```

Working on a windowing issue? Use `npm run package:dir` and run the unpacked binary — `electron-vite dev` creates nodes/directories differently and is not a substitute.

## Ground rules

- **Tests first for money, stock, permissions, and branches.** Any change to payments/refunds, inventory ledger, gift cards/store credit/loyalty, purchasing receive, register cash, IPC permission wiring, or branch scoping should come with a test that FAILS without it.
- **Adversarial suites are load-bearing.** Never delete, skip, or weaken `tests/integration/adversarial-*.test.ts` or `tests/unit/money-fuzz.test.ts`. If a fix genuinely changes intended behavior, update the test in the same commit with reasoning.
- **No silent failures.** Errors must be deliberate (`AppError` with a code) — never swallowed, never a bare `TypeError`.
- **Deterministic artifacts.** `Math.random`/`Date.now` have no place in financial flows — use UUIDs and service timestamps.
- **Honest sync/hardware.** If a transport or device doesn't exist, say so. The sync outbox is local-only; there is no remote transport. Physical hardware adapters are simulator-verified only.

## IPC checklist (new channel)

1. Add an `IpcChannel.X` constant.
2. Add a Zod schema in the matching `src/main/register*.ts` file, with a permission or `requiresAuth`.
3. Add a typed wrapper in `src/shared/ipc/api.ts` and `src/preload/index.ts`.
4. Keep the service thin: business invariant in the service, schema + permission shell in the IPC handler.
5. Update `docs/API.md` in the same PR — the channel table must reflect registrations.

## Database migrations

Append — never rewrite — in `src/main/db/migrator.ts`. A migration is followed by a `packages:` verification that an old database upgrades cleanly.

## Code style

Prettier + ESLint gates (`format:check`, `lint`) must pass. Money uses integer minor units via `@shared/lib/money`. Quantities use integer milli-units via `@shared/lib/quantity`.

## Detailed documentation

The full contributing standard, including the audit trail and defect-register expectations, lives in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) and [`docs/AUDIT/REPORT.md`](docs/AUDIT/REPORT.md).

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

See [`SECURITY.md`](SECURITY.md) for vulnerability reporting instructions.

## License

APEXPOS is released under the [MIT License](LICENSE).
