import { hashSync, verifySync } from '@node-rs/argon2'

/**
 * OWASP-recommended Argon2id parameters: 19 MiB memory, 2 iterations, 1 lane.
 * The default algorithm of @node-rs/argon2 is Argon2id; parameters here
 * follow the OWASP password storage cheat sheet.
 * See SECURITY.md for rationale and validation.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const

export const hashPassword = (plain: string): string => hashSync(plain, OPTIONS)

export const verifyPassword = (hashed: string, plain: string): boolean => {
  try {
    return verifySync(hashed, plain, OPTIONS)
  } catch {
    return false
  }
}
