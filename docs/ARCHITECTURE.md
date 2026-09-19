# Architecture

## Process Model (3-process)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
├──────────────────┬──────────────────────────────┬──────────────┤
│   Main Process   │        Preload (CJS)         │  Renderer    │
│   (Node, full    │  (sandboxed, contextBridge)  │  (React,     │
│    Node APIs)    │  window.api → IPC            │   Chromium)  │
├──────────────────┼──────────────────────────────┼──────────────┤
│ • DB (better-    │ • invoke(channel, args)      │ • UI only    │
│   sqlite3)       │   → Promise<IpcResult<T>>    │ • No Node    │
│ • Services       │ • on(channel, cb)            │   APIs       │
│   (Auth, Orders, │   (display push)             │ • Zustand    │
│   Payments, ...) │ • No direct DB access        │ • TanStack   │
│ • Hardware       │ • Typed PosApi contract      │   Query      │
│   (ESC/POS)      │                              │ • React      │
│ • Window mgmt    │                              │   Router     │
│ • IPC registry   │                              │              │
└──────────────────┴──────────────────────────────┴──────────────┘
```

## IPC Design

All IPC goes through `src/main/ipc/registry.ts`:

```typescript
handle(channel, { permission?, anyOfPermissions?, schema?, handler }, services, getSession)
```

- **Validation**: Zod schema (optional) on payload
- **Auth**: `permission` (single) OR `anyOfPermissions` (one-of)
- **Session**: Retrieved via `getSession()` (Zustand in renderer, token in main)
- **Envelope**: `{ ok: true, data: T } | { ok: false, error: { code, message, details? } }`
- **No `ipcMain.on` for requests** — only `handle` (request/response). `on` used only for fire-and-forget display push.

## Service Layer

Each domain has a service class in `src/main/services/`:

| Service           | Responsibility                                       |
| ----------------- | ---------------------------------------------------- |
| `AuthService`     | Login, PIN, sessions, roles, audit, overrides        |
| `OrderService`    | Draft/held/void/complete, stock deduction            |
| `PaymentService`  | Split tender, change, gift card, refund (prorated)   |
| `RegisterService` | Shift open/close, expected/actual cash, pay in/out   |
| `ProductService`  | Search, barcode, onHand, lowStock                    |
| `Pricing`         | Line totals, tax, discounts, rounding                |
| `ReportService`   | Dashboard, sales summary, categories, hourly, shift  |
| `CustomerService` | CRUD, loyalty/store-credit (audit trail), gift cards |
| `SettingsService` | Registry-validated get/set/all                       |
| `SystemService`   | Backup (SQLite online backup), notifications         |

All services receive `db: BetterSqlite3Database` and `branchId` in constructor.

## Data Flow: Sale

```
User clicks product
    → Renderer: addProduct(product) → cartStore (Zustand)
    → Preload: display.push(cart) → Main: ipcMain.on('customer:update') → CustomerDisplay window
User clicks Checkout → Payment modal
User selects Cash → Renderer: payments.tender(input)
    → Preload: invoke('payments:tender', input)
    → Main: handler → PaymentService.tender()
        → OrderService.completePayment() (stock deduction, order status=completed)
        → Returns completed Order
    → Renderer: Receipt modal (order.id)
User clicks Print → Renderer: hardware:printReceipt(orderId)
    → Main: HardwareService.printReceipt(order) → renders 42-col receipt text
      (simulated printer, job log + preview returned; ESC/POS adapter is the
      intended real-device replacement)
```

## Money & Quantity

- **Money** = integer minor units (PKR: 1 = 1 paisa). `money.ts`: `add`, `sub`, `mul`, `div`, `roundHalfAwayFromZero`, `fmt`.
- **Quantity** = integer milli-units (1 kg = 1000). `quantity.ts`: `toMilli`, `fromMilli`, `fmtQty`.
- **No floating point** anywhere in business logic.

## Permissions

Defined in `src/shared/auth/permissions.ts` (10 groups, ~50 keys). Roles seeded in `seed.ts`.

- `anyOfPermissions: ['inventory.view','sales.view']` for catalog reads (cashier has `sales.view` only).
- IPC handlers declare required permission(s); registry enforces at call time.

## Customer Display

Separate Electron `BrowserWindow` (`?display=customer`). Cart updates flow over the
`customer:update` channel: renderer → `preload: display.push()` → `ipcMain.on('customer:update')` →
`webContents.send('customer:update')` → display preload subscription → `CustomerDisplayScreen`.

## Kitchen Display (KDS)

- `restaurantService.ts` manages tables, orders sent to kitchen.
- IPC: `kitchen:board()` returns tickets; `kitchen:bump(orderId)` marks served.
- Renderer `KitchenScreen` polls every 5s, shows urgency colors (green/amber/red) + non-color cues.

## Offline-First

- No network required. All data in local SQLite (WAL mode).
- `sync_outbox` table exists for future sync (not implemented).
- Backups checkpoint the WAL (`wal_checkpoint(TRUNCATE)`) and copy the resulting
  consistent database file into `backups/`. Restore atomically replaces the live DB
  (validated filename within the backups directory only) and relaunches the app.

## Build Pipeline

```
npm run build
  → electron-vite build
    → Main: esbuild (CJS) → out/main/
    → Preload: esbuild (CJS, no externals) → out/preload/index.cjs
    → Renderer: Vite + Rollup (ESM) → out/renderer/
  → electron-builder
    → NSIS (Windows), AppImage/deb (Linux), DMG (macOS)
```

## Type Safety

- `tsconfig.base.json` → strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- Shared types in `src/shared/` imported via `@shared/...` path aliases.
- IPC contracts in `src/shared/ipc/api.ts` → `PosApi` mirrored in preload.
