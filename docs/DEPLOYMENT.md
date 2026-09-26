# Deployment

## Supported targets (electron-builder)

| Target                   | Configured | Built here                                                                                                              | Runtime tested here                                                                            |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Linux unpacked (`--dir`) | ✅         | ✅ `release/linux-unpacked`                                                                                             | ✅ cold-start + demo-seeded full cash sale + WAL DB healthy (see `scripts/packaged-smoke.mjs`) |
| Linux AppImage / `.deb`  | ✅         | ✅ cross-built from this Linux host (`npm run package:linux`)                                                           | not runtime-tested (AppImage not executed here)                                                |
| Windows NSIS / portable  | ✅         | ✅ cross-built from this Linux host (`npm run package:win`, win32 argon2 binding shipped via `scripts/win-natives.mjs`) | **not runtime-testable here** — no Windows host                                                |
| macOS DMG (x64/arm64)    | ✅         | not built (needs macOS)                                                                                                 | **not runtime testable here**                                                                  |

Do not claim Windows/macOS runtime verification from Linux. Build them on their native
runners in CI; then run `scripts/packaged-smoke.mjs`-equivalent on each platform.

## Data layout

| Path                             | Contents                                       |
| -------------------------------- | ---------------------------------------------- |
| `$APEXPOS_DATA_DIR/apexpos.db`   | SQLite (WAL). Live money.                      |
| `$APEXPOS_DATA_DIR/backups/*.db` | Verified full DB snapshots (checkpoint + copy) |

Default dir: Electron `userData/apexpos-data` per OS unless `APEXPOS_DATA_DIR` is set.

## First run

- Fresh profile → onboarding wizard (business profile → country/locale → currency → tax →
  mode → administrator → theme → register → hardware → optional demo data → restart).
- `APEXPOS_SEED_DEMO=1` skips the wizard and seeds the demo store (CI/dev/eval only).
- Production builds: do **not** seed demo data; the wizard is the intended path.

## Upgrading (packaged)

1. Install the new build over the old one.
2. The app boots, runs pending migrations inside transactions, then refuses to run with the
   old DB only if migration fails loudly (there is no silent half-migration; migrations are
   booked in the `migrations` table and re-applied idempotently).
3. Backups created before the upgrade remain restorable (restore validates integrity + FK +
   schema fingerprint before swapping).

## Updates

`electron-updater` is present but **no update feed is configured** — the app never phones
home. To enable signed auto-updates, publish per-platform artifacts and set
`APEXPOS_UPDATE_FEED_URL` (see `.env.example`) — then document the signing certs and add
E2E coverage before shipping.
