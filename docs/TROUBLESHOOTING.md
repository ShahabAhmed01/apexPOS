# Troubleshooting

### App won't start / plain error on boot ("Cannot open database")

The most common cause is a **restore onto a corrupt backup**. Production restore validates
integrity _before_ replacing the live DB, so a bad file can never brick the install. If the
DB was damaged outside the app (power loss mid-checkpoint on unusual storage):

1. Do NOT keep relaunching.
2. `sqlite3 "$APEXPOS_DATA_DIR/apexpos.db" 'PRAGMA integrity_check;'`
3. If not `ok`: restore from the newest good `backups/*.db` via _Settings → Backup & data_.

### Login keeps locking me out

5 consecutive failures ⇒ 5-minute lockout per permission (deliberate; see SECURITY.md).
The same policy applies to manager-override PINs. Wait it out; do NOT pummel the form.

### Drawer/receipt actions do nothing

Both are simulated unless a real adapter is wired (HARDWARE.md). The simulator writes to the
job log and returns success — no physical device is required.

### "Sync" never shows _Synced_

Correct and intentional: there is no remote sync server (OFFLINE_SYNC.md). The header only
shows network status (online/offline) and the outbox shows pending ops honestly; it never
shows a fake success state.

### The packaged Windows/macOS build fails on Linux CI

NSIS/DMG cannot be built or run cross-platform reliably. Build them on their native runners.

### `npm audit` flakes offline

The audit endpoint needs the registry. Re-run when the network is back; the lockfile is
versioned.
