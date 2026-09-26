# Security

## Threat Model

| Asset           | Threats               | Mitigations                                            |
| --------------- | --------------------- | ------------------------------------------------------ |
| Local DB        | Theft, tampering      | File permissions, offline-only, no network             |
| Credentials     | Brute force, reuse    | Argon2id, PIN lockout, session expiry                  |
| Cash data       | Manipulation          | Append-only movements, audit log, shift reconciliation |
| IPC             | Injection, escalation | Zod validation, permission checks, typed envelopes     |
| Receipt printer | Malformed ESC/POS     | Strict byte generation, no user input in control codes |

## Authentication

- **Passwords**: Argon2id (node-rs/argon2) — `hashSync` / `verifySync` with OWASP-recommended
  parameters (m=19 MiB, t=2, p=1) — see `src/main/security/passwords.ts`.
- **PIN**: 4–8 digits, Argon2id-hashed, stored alongside password.
- **Session**: opaque UUID token held in an in-memory session map in the main process
  (12 h expiry). A `sessions` table row is written on password login for audit purposes;
  the in-memory map is authoritative at runtime.
- **Lockout**: 5 failed login attempts → 5 min lockout (case-insensitive per account). The same
  policy applies to the manager-override PIN (keyed per permission) to prevent online brute force.
- **Lock screen**: the manual lock (`app:lock`) is enforced at the IPC session gate — a locked
  terminal exposes no session to any privileged handler (regression: `TC-IPC-LOCK`). The
  inactivity auto-lock _timer_ is still triggered renderer-side only.
- **Override**: Manager PIN required for refunds; PIN attempts are rate-limited and audited.

## Permissions

- 10 groups × ~5 keys each (e.g., `sales.create`, `inventory.view`, `customers.credit`).
- Roles seeded: Owner (all), Admin (all), Manager (most), Cashier (POS + tables + customers), Waiter (tables + kitchen), Kitchen (KDS), Inventory, Purchasing, Accountant, Auditor.
- IPC handlers declare `permission` (single) OR `anyOfPermissions` (one-of).
- Registry enforces at call time; returns `FORBIDDEN` if missing.

## IPC Hardening

All request/response handlers use `handle()` in `src/main/ipc/registry.ts`:

```typescript
handle(channel, { permission?, anyOfPermissions?, schema?, handler }, services, getSession)
```

- **Validation**: Zod schema on payload (if provided) → `VALIDATION` error on fail.
- **Auth**: Session required for protected channels; token verified via `AuthService`.
- **Authorization**: Permission check via `AuthService.hasPermission(token, perm)`.
- **Envelope**: All responses wrapped in `IpcResult<T>`:
  - Success: `{ ok: true, data: T }`
  - Failure: `{ ok: false, error: { code, message, details? } }`
- **Error codes**: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`.

No `ipcMain.on` for request/response — only fire-and-forget (customer display push).

## Data Integrity

- **Money**: Integer minor units; all arithmetic in `money.ts` with half-away-from-zero rounding.
- **Quantities**: Integer milli-units; `quantity.ts` for conversions.
- **Stock**: Append-only `stock_movements` (qty_delta in milli-units). No direct stock column on products.
- **Audit**: Every loyalty/store-credit change writes `loyalty_transactions` / `store_credit_transactions`.
- **Payments**: Idempotent via `clientOpId` (order create) and per-payment `clientOpId:index`.

## Encryption

- **At rest**: None (local SQLite file). Relies on OS disk encryption (BitLocker, FileVault, LUKS).
- **In transit**: N/A (no network).
- **Secrets**: No secrets in code. Argon2 hashes only.

## Receipt Printer (ESC/POS)

- `src/main/hardware/receipt.ts` generates pure byte arrays.
- No user-controlled input in control sequences.
- Text width: 42 columns, auto-wrapped.

## Customer Display

Separate `BrowserWindow` with `nodeIntegration: false`, `contextIsolation: true`. Receives only cart snapshot via IPC.

## Settings Security

- Security settings (lockout, session, attempts) stored in `settings` table, validated by `SettingsService` against registry schema.
- Changes require `settings.manage` permission (Owner/Admin only).

## Phase-2 hardening additions (2026-09-23)

- Every restaurant table/order mutation (`open`, `close`, `transfer`, `requestBill`,
  `moveLines`, `merge`, `bump*`) is branch-scoped at the service boundary.
- `closeTable` never completes an unpaid order (payment bypass closed) — it rejects itemized
  orders and voids only empty shells.
- `inventory:adjust` requires `inventory.adjust` + a manager-PIN override (rate-limited).
- Backup restore validates the candidate: `integrity_check = ok`, zero FK violations, and an
  APEXPOS schema fingerprint — corrupt or foreign files are refused and the live DB untouched.
  Stale WAL/SHM sidecars are removed so old frames cannot replay onto the restored file.
- Purchase receiving is idempotent by client op id; over-receiving over a line is rejected;
  receiving is only legal from `sent`/`partial` states.
- Order/cash shift reads/writes use the session's branch — terminal-in-B cannot close the
  shift of branch A (mutation-tested).

## Known Limitations

- No disk encryption (relies on OS).
- No remote wipe / device binding.
- No hardware security module (TPM/HSM) integration.
- Single-user concurrent sessions per token (token invalidated on logout).

## Incident Response

1. **DB corruption**: Restore from backup (Settings → Backup & Data → Restart).
2. **Credential compromise**: Reset password via Owner login → Users → Edit.
3. **Cash discrepancy**: Shift Z-report shows variance; audit_log traces movements.
