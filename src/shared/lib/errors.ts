/**
 * Application error taxonomy. Codes are stable wire constants — they are part of
 * the IPC contract and are mapped to user-facing copy in the renderer.
 */
export const ErrorCode = {
  Validation: 'VALIDATION',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Forbidden: 'FORBIDDEN',
  Unauthorized: 'UNAUTHORIZED',
  SessionExpired: 'SESSION_EXPIRED',
  TooManyAttempts: 'TOO_MANY_ATTEMPTS',
  InsufficientFunds: 'INSUFFICIENT_FUNDS',
  InsufficientStock: 'INSUFFICIENT_STOCK',
  InvalidState: 'INVALID_STATE',
  ConstraintViolation: 'CONSTRAINT_VIOLATION',
  HardwareError: 'HARDWARE_ERROR',
  BackupError: 'BACKUP_ERROR',
  PaymentDeclined: 'PAYMENT_DECLINED',
  PaymentTimeout: 'PAYMENT_TIMEOUT',
  Internal: 'INTERNAL'
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError
  }
}

export const toErrorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
