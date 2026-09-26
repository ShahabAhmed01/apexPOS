# API — renderer ↔ main contract

All renderer→main calls go through IPC (`window.api`, exposed by `src/preload/index.ts`).
The transport contract is uniform:

```ts
invoke(channel: string, input): Promise<IpcResult<T>>

type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } }
```

Every handler (`src/main/ipc/registry.ts`) applies, in order:

1. **Validation** — the channel's zod schema (unknown/malformed payloads → `VALIDATION`).
2. **Authentication & authorization** — `requiresAuth`, `permission`, or `anyOfPermissions`,
   resolved against the current session. Fail-closed; deny by default (`FORBIDDEN` /
   `UNAUTHORIZED`).
3. **Branch scoping** — services receive the session's `branchId`; cross-branch IDs throw
   `FORBIDDEN` ("belongs to a different branch").
4. **Envelope mapping** — `AppError` → structured error; anything else → `INTERNAL`.

`ipcMain.on` is used ONLY for fire-and-forget pushes (customer display, virtual scanner).
Everything else is request/response.

## Channels actually registered in the main process

Catalog (`src/shared/ipc/channels.ts` → handlers in `src/main/ipc/*.ts`). The table lists only
REGISTERED handlers (the preload exposes exactly these — anything else rejects at invoke-time):

| Area          | Channels (registered)                                                                                                                                                                  | Auth                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| App           | `app:info`, `app:lock`, `app:restart`                                                                                                                                                  | public                                                                     |
| Onboarding    | `onboarding:state`, `onboarding:completeStep`, `onboarding:finish`                                                                                                                     | public (fail-closed once complete)                                         |
| Auth          | `auth:login`, `auth:loginPin`, `auth:logout`, `auth:session`, `auth:changePassword`, `auth:changePin`, `auth:listUsers`, `auth:hasPermission`, `auth:requireOverride`                  | public (login/session/override), per-op (rest)                             |
| Users/Roles   | `users:list`, `roles:list`                                                                                                                                                             | `users.view` (write APIs intentionally absent — see "Feature gaps")        |
| Audit         | `audit:list`                                                                                                                                                                           | `audit.view`                                                               |
| Catalog       | `products:list`, `products:get`, `products:search`, `products:byBarcode`, `categories:list`, `modifiers:list`, `taxes:list`, `discounts:list`                                          | `inventory.*` / `sales.view` (read). (Write APIs intentionally absent.)    |
| Orders        | `orders:create`, `orders:get`, `orders:updateDraft`, `orders:hold`, `orders:recall`, `orders:listHeld`, `orders:cancelHeld`, `orders:void`, `orders:receipt`                           | `sales.*` per op                                                           |
| Payments      | `payments:tender`, `payments:refund`, `payments:recent`                                                                                                                                | `payments.take` / `sales.refund` (+ manager PIN override at service level) |
| Register      | `register:open`, `register:close`, `register:current`, `register:cashMovement`, `register:xReport`, `register:zReport`                                                                 | `register.open/close`, `cash.adjust`, `cash.view_variance` (zReport)       |
| Inventory     | `inventory:onHand`, `inventory:movements`, `inventory:adjust`, `inventory:lowStock`                                                                                                    | `inventory.view`, `inventory.adjust` (+ manager PIN)                       |
| Purchasing    | `suppliers:list`, `suppliers:save`, `purchaseOrders:list`, `purchaseOrders:get`, `purchaseOrders:create`, `purchaseOrders:send`, `purchaseOrders:receive`, `purchaseOrders:cancel`     | `purchases.view / create / approve / receive`                              |
| Customers/CRM | `customers:list`, `customers:save`, `customers:adjustLoyalty`, `giftCards:list`, `giftCards:issue`, `giftCards:balance`                                                                | `customers.view / manage / credit`                                         |
| Restaurant    | `floors:get`, `floors:save` (tables only), `tables:open`, `tables:close`, `tables:transfer`, `tables:requestBill`, `tables:moveLines`, `tables:merge`, `kitchen:board`, `kitchen:bump` | `tables.view / manage / transfer`, `kitchen.view / manage`                 |
| Settings      | `settings:get`, `settings:set`, `settings:all`, `notifications:list`, `notifications:markRead`                                                                                         | session (get), `settings.manage` (set/all)                                 |
| Hardware      | `hardware:test`, `hardware:openDrawer`, `hardware:printReceipt`, `hardware:customerDisplay`                                                                                            | session; drawer also needs `cash.no_sale`                                  |
| Backup        | `backup:list`, `backup:create`, `backup:restore`                                                                                                                                       | `data.backup` / `data.restore`                                             |
| Reports       | `reports:dashboard`, `reports:sales`, `reports:financial`                                                                                                                              | `reports.view`                                                             |
| Sync          | `sync:status`                                                                                                                                                                          | session (local outbox truth only — see `OFFLINE_SYNC.md`)                  |

> Note: `IpcChannel` declares a wider constant list than is currently registered. Unregistered
> channels are unreachable by definition (no handler ⇒ invoke rejects). They are future slots,
> not hidden attack surface — the registry is the enforcement point. Feature gaps (absent by
> design at v0.2.x, previously dead channels now removed from the preload surface):
> `users:create/update/setActive`, `roles:create/update/delete`, `products:create/update/archive`,
> `categories:create/update/delete`, `modifiers:save`, `floors:save` for zones,
> `hardware:virtualScan`, `app:unlock` (unlock is `auth:loginPin` against the locked session's user),
> import/export (`data:export`, `import:*`), sync transport (`sync:push/setOnline`), KDS recall /
> course firing channels, and report export channels (CSV is generated renderer-side).

## Idempotency conventions

Mutations that money depends on accept `clientOpId` (UUIDv4):

- `orders.create` / `payments.tender` / `payments.refund` — `UNIQUE` on `client_op_id`;
  a repeated call returns the existing result instead of duplicating effects.
- `purchaseOrders.receive` — outbox-keyed idempotency (`po-receive:<clientOpId>`).

Same-op replays are therefore safe across double-clicks, IPC retries and reconnects.

## Errors

`ErrorCode`: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`INVALID_STATE`, `INSUFFICIENT_FUNDS`, `PAYMENT_DECLINED`, `RATE_LIMITED`, `INTERNAL`.
Renderer never receives stack traces — only `{ code, message, details? }`.

## Notes for implementers

- Add a channel ⇒ define the constant, the zod schema, register the handler with a permission,
  expose the typed wrapper in `src/shared/ipc/api.ts` + `src/preload/index.ts`, and test it
  (see `TESTING.md`).
- The renderer NEVER computes financial truth that the main process accepts — totals shown
  in the POS preview use the same pure function (`src/shared/lib/pricing.ts`), the server is
  authoritative at tender time.
