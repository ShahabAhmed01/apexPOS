/// <reference types="vite/client" />
import type { PosApi } from '@shared/ipc/api'

declare global {
  interface Window {
    api: PosApi
  }
}

export {}
