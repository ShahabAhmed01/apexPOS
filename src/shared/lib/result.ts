/**
 * Uniform success/failure carrier used across services and the IPC boundary.
 * Services return Results; the IPC layer maps them onto the wire envelope.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
