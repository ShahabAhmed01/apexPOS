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

Catalog (`src/shared/ipc/channels.ts` → handlers in `src/main/ipc/*.ts`):

| Area          | Channels                                                                                                                                                              | Auth                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| App           | `app:info`, `app:lock`, `app:unlock`, `app:restart`                                                                                                                   | public (info/restart), session (lock/unlock)              |
| Onboarding    | `onboarding:state`, `onboarding:completeStep`, `onboarding:finish`                                                                                                    | public (only before first user exists / session after)    |
| Auth          | `auth:login`, `auth:loginPin`, `auth:logout`, `auth:session`, `auth:changePassword`, `auth:changePin`, `auth:listUsers`, `auth:hasPermission`, `auth:requireOverride` | public (login/session), per-op (rest)                     |
| Users/Roles   | `users:list                                                                                                                                                           | create                                                    | update                          | setActive`, `roles:list                                                    | create                                               | update          | delete`                              | `users.*` / `roles.manage` |
| Audit         | `audit:list`                                                                                                                                                          | `audit.view`                                              |
| Catalog       | `products:list                                                                                                                                                        | get                                                       | create                          | update                                                                     | archive                                              | search          | byBarcode`, `categories:list         | create                     | update       | delete`, `modifiers:list | save`, `taxes:list`, `discounts:list` | `inventory.*` / `sales.view` (read), `inventory.manage` (write) |
| Orders        | `orders:create                                                                                                                                                        | get                                                       | updateDraft                     | hold                                                                       | recall                                               | listHeld        | cancelHeld                           | void                       | receipt`     | `sales.*` per op         |
| Payments      | `payments:tender                                                                                                                                                      | refund                                                    | recent`                         | `payments.take` / `sales.refund` (+ manager PIN override at service level) |
| Register      | `register:open                                                                                                                                                        | close                                                     | current                         | cashMovement                                                               | xReport                                              | zReport`        | `register.open/close`, `cash.adjust` |
| Inventory     | `inventory:onHand                                                                                                                                                     | movements                                                 | adjust                          | lowStock`                                                                  | `inventory.view`, `inventory.adjust` (+ manager PIN) |
| Purchasing    | `suppliers:list                                                                                                                                                       | save`, `purchaseOrders:list                               | get                             | create                                                                     | send                                                 | receive         | cancel`                              | `purchases.view            | create       | approve                  | receive`                              |
| Customers/CRM | `customers:list                                                                                                                                                       | save                                                      | adjustLoyalty`, `giftCards:list | issue                                                                      | balance`                                             | `customers.view | manage                               | credit`                    |
| Restaurant    | `floors:get                                                                                                                                                           | save`, `tables:open                                       | close                           | transfer                                                                   | requestBill                                          | moveLines       | merge`, `kitchen:board               | bump`                      | `tables.view | manage                   | transfer`, `kitchen.view              | manage`                                                         |
| Settings      | `settings:get                                                                                                                                                         | set                                                       | all`, `notifications:list       | markRead`                                                                  | session (get), `settings.manage` (set/all)           |
| Hardware      | `hardware:test`, `hardware:openDrawer`, `hardware:customerDisplay`                                                                                                    | session; drawer also needs `cash.no_sale`                 |
| Backup        | `backup:list                                                                                                                                                          | create                                                    | restore`                        | `data.backup` / `data.restore`                                             |
| Reports       | `reports:dashboard                                                                                                                                                    | sales                                                     | financial`                      | `reports.view`                                                             |
| Sync          | `sync:status`                                                                                                                                                         | session (local outbox truth only — see `OFFLINE_SYNC.md`) |

> Note: `IpcChannel` declares a wider constant list than is currently registered. Unregistered
> channels are unreachable by definition (no handler ⇒ invoke rejects). They are future slots,
> not hidden attack surface — the registry is the enforcement point.

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
