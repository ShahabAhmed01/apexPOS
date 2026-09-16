/**
 * Wire envelope for every IPC call. Preload maps thrown/returned errors into
 * this shape; the renderer never sees raw exceptions from the main process.
 */
export type IpcError = {
  code: string
  message: string
  /** Optional structured detail (e.g. zod issues). Safe for renderer display logic. */
  details?: unknown
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export const ipcOk = <T>(data: T): IpcResult<T> => ({ ok: true, data })
export const ipcErr = (error: IpcError): IpcResult<never> => ({ ok: false, error })
