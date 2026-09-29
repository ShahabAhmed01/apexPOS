# UI REFINEMENT REPORT — v0.2.3 visual/UX cycle (2026-09-28 → 2026-09-29)

A full-surface visual refinement of the renderer, executed under a strict
preservation mandate: **keep the entire product, improve the entire presentation.**
No functional change was allowed; every gate that existed before had to stay green.

## Scope

- 23 files, **all under `src/renderer`** (22 modified + 1 new `design-system/Badge.tsx`).
- Zero changes to main process, preload, IPC contracts, schema, services, shared
  types, or tests. The `PosScreen.tsx` diff was verified line-by-line to contain
  **no logic changes** — only JSX/class changes.

## Design-system work

### Tokens (`styles/globals.css`)

- Palette refined toward a neutral-first "control room" system (dark default,
  hand-tuned light theme): app canvas `#0b0f14` / `#f6f7f9`, surfaces
  `#11161d/#1a212b/#212a36` / `#ffffff/#f3f4f6/#e9edf2`, borders `#252d37` /
  `#e5e7eb`. Accent: `#60a5fa` foreground (≈7.4:1 on dark) and `#2563eb` solid
  (white text ≥ AA). Semantic status colors unchanged in hue — they were already
  contrast-audited.
- **Defect fixed:** `--color-border-strong` was `#31405229` — a stray alpha
  suffix made "strong borders" render at ~16% opacity. Now `#3d4a5c`.
- Added: `--color-overlay`, three-level elevation (`--shadow-raised/overlay/modal`),
  interaction-timing tokens (`--duration-fast` 120 ms / `--duration-normal` 160 ms),
  `fade-in` / `dialog-in` (opacity + 6 px + scale .98→1) / `pop-in` keyframes wired
  to Radix `data-[state=open]`, and a `.panel` / `.data-table` / `.kbd` component
  class layer to stop per-screen style duplication.
- Radius discipline: controls 8 px, panels 10 px, dialogs 14 px — enforced through
  the existing `--radius-sm/md/lg` tokens (no arbitrary radii anywhere).

### Primitives

- `Button` — pressed states, `--shadow-raised` on solid variants, md 40→36 px
  for desktop density; API unchanged (all five variants kept).
- `Input` / `Select` — matching h-9, hover (`border-strong`) + focus (`accent`)
  borders, RTL-logical `ps/pe` padding (the Select chevron previously overlapped
  text in Urdu).
- `Switch` — bordered track (light-theme contrast), `dir="ltr"` thumb so RTL
  keeps correct on/off direction.
- `Modal` — animated entry, `--color-overlay` scrim, `--shadow-modal`, optional
  `contentClassName` (used by the palette for a flush body). Radix `role=dialog`
  / `role=heading` contracts preserved.
- **New** `Badge` — six semantic tones, span-based so every existing
  `span:has-text("Draft")`-class test selector keeps matching.

## Screens refined

AppShell (rail, header, palette affordance, fixed language-menu dismissal),
POS (search + kbd hint, product cards, cart rows, totals hierarchy, tenders),
Floor (selected-table ring, quieter status tiles, action hierarchy, detail panel),
KDS (order-number weight, urgency chips, qty emphasis), Dashboard (neutralized
KPI hierarchy, chart token colors), Inventory (shared `.data-table`, quieter
low-stock), Purchasing (segmented tabs/chips, semantic status badges, PO modal
hierarchy: Send/Receive primary, Cancel destructive, Close ghost), Customers,
Reports (panels, hour-chart container), Settings (grouped form panels, semantic
flash), Onboarding (progress dots, option cards), Command palette, Login,
Lock (added explicit Unlock button — Enter-submission unchanged), Customer
display.

## UX defects fixed along the way

| #   | Finding                                                  | Disposition                                                       |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| U-1 | `--color-border-strong` alpha suffix (invisible borders) | Token fixed                                                       |
| U-2 | Language menu never closed on outside click              | pointer-down + Escape dismissal, `aria-expanded` kept             |
| U-3 | `Select` chevron overlapped text in RTL                  | Logical `pe-8` + `end-2.5`                                        |
| U-4 | Command palette undiscoverable (Ctrl+K invisible)        | Header `Search · Ctrl K` affordance dispatching the same shortcut |
| U-5 | Switch thumb direction inverted in RTL                   | `dir="ltr"` track                                                 |

## Verification (2026-09-29, this machine)

| Gate               | Command                            | Result                                                                          |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------- |
| Format             | `npm run format:check`             | All files use Prettier code style                                               |
| Lint               | `npm run lint`                     | 0 problems                                                                      |
| Typecheck          | `npm run typecheck`                | 0 errors × 3 projects                                                           |
| Unit + integration | `npm test`                         | **175/175**                                                                     |
| Build              | `npm run build`                    | ✓                                                                               |
| Release E2E        | `npm run test:e2e`                 | **18/18** (incl. axe WCAG A/AA clean × 9 screens, keyboard-only sale, Urdu RTL) |
| Torture E2E        | `npm run test:torture`             | **53/53** (re-run on final state)                                               |
| DOM layout audit   | EN+UR × 9 screens × 2 window sizes | No overflow, no offscreen elements                                              |
| Palette affordance | live-app check                     | Opens palette; language menu dismisses                                          |

Baseline and refined screenshot sets (16 screens × dark/light/Urdu) were captured
for comparison during the cycle; no test file, selector, or assertion was modified.

## Test-selector contract preserved

Every selector the suites depend on was kept verbatim, including:
`#username/#password/button[type=submit]`, `input[aria-label="Search products"]`,
`text=Current Sale/Cart is empty/Subtotal/Total/Charge/Payment complete`,
`button[title="Discount"/"Hold order"]`, `aria-label="Discount value"/"Hold name"/
"Clear cart"/"Increase·Decrease·Remove quantity of X"`, `ul li span.nums` (qty-first),
`.grid button`, `div.font-mono`, `Held orders (N)`, `N active tickets`,
`span:has-text("Draft"/"Received"/"Cancelled")`, `getByLabel('Supplier'|'Name'|'Contact')`,
`getByRole('heading', {name: /PO #\d+ —/})`, `header span:has-text("·")`,
`nav[aria-label="Primary"] a[aria-label=…]`, `text=Enter your PIN to unlock`,
`input[aria-label="PIN"]`, `button:has-text("Seat party of"/"Cash"/"Hold"/"New backup"/
"Backup & data")`, `text=Command palette`, `[role=option]`.
