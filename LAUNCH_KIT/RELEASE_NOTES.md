# APEXPOS — Release Notes (Draft v0.2.3)

Repository: https://github.com/ShahabAhmed01/apexPOS
Tag: v0.2.3 (exists)
Status: DRAFT — not yet published

---

# APEXPOS v0.2.3 — UI refinement release

## Highlights

- Full-surface visual/UX refinement of the renderer (23 files, all under `src/renderer`; zero functional, IPC, schema, or test changes)
- Windows portable executable restored to the release set
- Header command-palette affordance (`Search · Ctrl K`) for discoverability
- New `Badge` design-system primitive
- Rebuilt design token layer (elevation, timing, overlay)
- 5 UX defects fixed (invisible strong borders, language-menu dismissal, RTL select chevron, RTL switch thumb, palette discoverability)

## What changed

### Added

- `design-system/Badge.tsx` — one semantic status-pill primitive
- Token layer: `--color-overlay`, three elevation levels (`--shadow-raised/overlay/modal`), interaction-timing tokens, `fade-in`/`dialog-in`/`pop-in` keyframes, `.panel`/`.data-table`/`.kbd` component classes
- Explicit Unlock button on the lock screen
- `app.search` i18n key in both English and Urdu
- Windows portable exe (`APEXPOS-0.2.3-portable-x64.exe`) alongside the NSIS setup

### Fixed

- `--color-border-strong` rendered at ~16% opacity (stray alpha suffix `#31405229`) — strong borders were nearly invisible
- Language menu never closed on outside click — now pointer-down + Escape dismissal (RTL-correct anchoring)
- `Select` chevron overlapped option text in RTL
- `Switch` thumb moved the wrong way in RTL

### Changed

- Palette refined toward a neutral-first system (dark `#0b0f14/#11161d/#1a212b`, light `#f6f7f9/#ffffff/#f3f4f6`; accent `#60a5fa` dark / `#2563eb` light, both AA+)
- All positioning converted to logical properties (`border-e/s`, `ps/pe`, `start/end`)
- Receipt paper intentionally stays LTR in Urdu (simulates physical print)

## Verification

| Gate                | Result                                                     |
| ------------------- | ---------------------------------------------------------- |
| format / lint / tsc | All clean                                                  |
| Unit + integration  | 175/175 (Vitest, real SQLite, incl. adversarial suites)    |
| E2E (real Electron) | 18/18 (incl. axe WCAG A/AA clean on all 9 primary screens) |
| Torture E2E         | 53/53 (re-run on the refined state)                        |
| Money fuzz          | ~205,000 deterministic cases vs. independent oracle        |
| IPC fuzz            | Every registered channel × malicious payload classes       |
| Multi-process races | 4 OS processes on one DB (tables, gift cards, idempotency) |
| DB reconciliation   | `PRAGMA integrity_check` + `foreign_key_check` clean       |
| Packaged binary     | Linux unpacked cold-boot smoke (sale + WAL health)         |
| `npm audit`         | 0 vulnerabilities                                          |

## Installation

Build from source (Node 20+ required):

```bash
git clone https://github.com/ShahabAhmed01/apexPOS.git
cd apexPOS
git checkout v0.2.3
npm ci
npm run build
npm run dev
```

Or run the unpacked binary:

```bash
npm run package:dir
```

Prebuilt installers (Linux AppImage/deb, Windows NSIS/portable) will be attached to this release once built.

## Default Users (seeded)

| Username   | Password      | Role                             |
| ---------- | ------------- | -------------------------------- |
| owner      | Owner123!     | Owner (all permissions)          |
| admin      | Admin123!     | Administrator                    |
| manager    | Manager123!   | Manager                          |
| cashier    | Cashier123!   | Cashier (POS, tables, customers) |
| waiter     | Waiter123!    | Waiter (tables, kitchen)         |
| kitchen    | Kitchen123!   | Kitchen (KDS)                    |
| inventory  | Inventory123! | Inventory                        |
| purchasing | Purchase123!  | Purchasing                       |
| accountant | Account123!   | Accountant                       |
| auditor    | Audit123!     | Auditor                          |

All users have PIN `1234` for quick lock/unlock.

> **Security note:** Seeded demo credentials are intentional for evaluation. Production deployments must rotate all seeded credentials before use.

## Compatibility

- Windows (NSIS installer, portable exe)
- Linux (AppImage, deb)
- macOS: DMG not buildable from Linux (build on macOS for DMG)

## Known limitations

- No remote sync transport (deliberately feature-absent; outbox is local-only)
- Physical hardware adapters (receipt printer, cash drawer) are simulator-verified only
- Seeded demo credentials must be rotated before production use

## Full audit trail

- v0.2.3 UI refinement: `docs/AUDIT/UI_REFINEMENT_REPORT.md`
- Exhaustive test report: `docs/AUDIT/EXHAUSTIVE_TEST_REPORT.md`
- Live torture test report: `docs/AUDIT/LIVE_TORTURE_TEST_REPORT.md`
- Changelog: `docs/CHANGELOG.md`

---

**Note:** This is a draft. Do not publish until build artifacts are verified and attached.
