/** Portable UUIDv4 — works in Electron main, preload and renderer. */
export const newId = (): string => globalThis.crypto.randomUUID()

/** Used for idempotency keys and sync operation ids. */
export const newOperationId = (): string => globalThis.crypto.randomUUID()
