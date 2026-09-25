# Offline-first & Sync — honest status

## What exists (verified)

**APEXPOS is fully offline-first for its core job.** Nothing in login, catalog, pricing,
checkout, tendering, refunds, register shifts, inventory, purchasing, KDS, reports, backup
or restore touches the network. Verified by the entire E2E + integration suite running
without network reliance, on this machine.

**Local outbox** (`sync_outbox` table, `SyncService`):

- Domain writes enqueue an operation _inside the same transaction_ as the state change
  (so an operation can never exist without its queue entry, or vice versa).
- `op_id` is UNIQUE and carries the client's idempotency key (`tender:<clientOpId>`,
  `refund:<clientOpId>`, `po-receive:<clientOpId>` …) — replays are no-ops at two levels:
  the queue AND the target tables.
- `pendingOps()` returns strictly ordered (created_at, rowid) pending work for a future
  transport.
- `recordAttempt(opId, error)` counts failures; success sets `synced_at`.
- The queue survives application restarts (file-backed; verified in tests).
- `status()` reports `pending`/`failed` counts and a state. **It never reports `synced`** —
  no remote target exists, so a truthful status only ever says `offline` / `delayed` /
  `failed`.

## What does NOT exist (declared, not simulated)

There is **no central sync server / cloud transport** in this codebase. Multi-branch is
schema-supported (branch scoping is enforced — see `tests/integration/multibranch.test.ts`),
but convergence between devices/branches requires a real remote ingest that:

1. Accepts `pendingOps` extracts,
2. Applies them idempotently (`op_id` idempotent),
3. Provides the conflict policy for shared mutable fields (balances!).

**Conflict model (designed, unimplemented):** operation journal wins for ledgers (append-only,
so reconstruction is deterministic); entity last-writer-wins only for non-financial fields.

Financial history is never "synced over" — outbox design forbids it.

> Verdict: **Offline core = VERIFIED. Remote sync transport = FEATURE ABSENT (honest
> boundary documented here, tested as such).**
