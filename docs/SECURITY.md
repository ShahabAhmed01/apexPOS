# Security

## Threat Model

| Asset | Threats | Mitigations |
|-------|---------|-------------|
| Local DB | Theft, tampering | File permissions, offline-only, no network |
| Credentials | Brute force, reuse | Argon2id, PIN lockout, session expiry |
| Cash data | Manipulation | Append-only movements, audit log, shift reconciliation |
| IPC | Injection, escalation | Zod validation, permission checks, typed envelopes |
| Receipt printer | Malformed ESC/POS | Strict byte generation, no user input in control codes |

## Authentication

- **Passwords**: Argon2id (node-rs/argon2) — `hashSync` / `verifySync`. Default params (t=3, m=64MB, p=4).
- **PIN**: 4-digit, verified via same Argon2id hash (stored alongside password).
- **Session**: JWT-like opaque token (UUID) stored in `sessions` table with expiry.
- **Lockout**: 5 failed attempts → 5 min lockout (configurable in Settings → Security).
- **Auto-lock**: Inactivity timeout (default 5 min, configurable).
- **Override**: Manager PIN required for void/refund/discount beyond limits.

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

## Known Limitations

- No disk encryption (relies on OS).
- No remote wipe / device binding.
- No hardware security module (TPM/HSM) integration.
- Single-user concurrent sessions per token (token invalidated on logout).

## Incident Response

1. **DB corruption**: Restore from backup (Settings → Backup & Data → Restart).
2. **Credential compromise**: Reset password via Owner login → Users → Edit.
3. **Cash discrepancy**: Shift Z-report shows variance; audit_log traces movements.
