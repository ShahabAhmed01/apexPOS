import { create } from 'zustand'
import type { SessionInfo } from '@shared/types/models'

interface SessionState {
  session: SessionInfo | null
  locked: boolean
  setSession: (s: SessionInfo | null) => void
  lock: () => void
  unlock: () => void
  logout: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  locked: false,
  setSession: (session) => set({ session, locked: false }),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  logout: () => set({ session: null, locked: false })
}))

export const usePermission = (permission: string): boolean => {
  const { session } = useSessionStore()
  return session?.permissions.includes(permission) ?? false
}
