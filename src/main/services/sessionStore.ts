import type { SessionInfo } from '@shared/types/models'

/**
 * Holds the currently active renderer-side session token. There is at most one
 * interactive session per terminal (single-window POS), enforced here.
 */
export class SessionStore {
  private current: SessionInfo | null = null
  private locked = false

  set(session: SessionInfo): void {
    this.current = session
    this.locked = false
  }

  get(): SessionInfo | null {
    return this.current
  }

  clear(): void {
    this.current = null
    this.locked = false
  }

  lock(): boolean {
    if (!this.current) return false
    this.locked = true
    return true
  }

  unlock(): void {
    this.locked = false
  }

  isLocked(): boolean {
    return this.locked
  }
}
