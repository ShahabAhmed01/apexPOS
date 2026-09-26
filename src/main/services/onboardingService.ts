import { z } from 'zod'
import type { DB } from '../db/database'
import { seedBase, seedDemoCatalog } from '../db/seed'
import { hashPassword } from '../security/passwords'
import { AppError, ErrorCode } from '@shared/lib/errors'
import { onboardingStateSchema, type hardwareSettingsSchema } from '@shared/settings/registry'

const now = (): string => new Date().toISOString()
const newId = (): string => crypto.randomUUID()

export type OnboardingState = z.infer<typeof onboardingStateSchema>
export type OnboardingData = OnboardingState['data']

/** Payload for the final step — includes secrets that are never persisted. */
export const onboardingFinishSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(120).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  taxId: z.string().trim().max(60).optional().default(''),
  country: z.string().trim().min(2).max(2),
  language: z.string().min(2).max(8).default('en'),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  symbolPosition: z.enum(['before', 'after']).default('before'),
  timezone: z.string().min(1).max(64),
  taxName: z.string().trim().min(1).max(60),
  taxRateBps: z.number().int().min(0).max(10000),
  taxInclusive: z.boolean().default(false),
  mode: z.enum(['retail', 'restaurant', 'hybrid']),
  adminUsername: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  adminDisplayName: z.string().trim().min(2).max(80),
  adminPassword: z.string().min(8).max(128),
  adminPin: z.string().regex(/^\d{4,8}$/),
  theme: z.enum(['dark', 'light', 'system']),
  registerName: z.string().trim().min(1).max(60),
  registerCode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9-]+$/i),
  openingFloat: z.number().int().min(0).default(0),
  printerProfile: z.enum(['none', 'simulator']).default('none'),
  cashDrawerProfile: z.enum(['none', 'simulator']).default('none'),
  demoData: z.boolean().default(false)
})

export type OnboardingFinishInput = z.infer<typeof onboardingFinishSchema>

const stepSchemas: Record<string, z.ZodType> = {
  business: z.object({
    businessName: z.string().trim().min(2).max(120),
    legalName: z.string().trim().max(120).optional().default(''),
    address: z.string().trim().max(240).optional().default(''),
    phone: z.string().trim().max(40).optional().default(''),
    email: z.string().trim().max(120).optional().default(''),
    taxId: z.string().trim().max(60).optional().default('')
  }),
  locale: z.object({
    country: z.string().trim().min(2).max(2),
    language: z.string().min(2).max(8),
    timezone: z.string().min(1).max(64)
  }),
  currency: z.object({
    currencyCode: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/),
    symbolPosition: z.enum(['before', 'after'])
  }),
  tax: z.object({
    taxName: z.string().trim().min(1).max(60),
    taxRateBps: z.number().int().min(0).max(10000),
    taxInclusive: z.boolean()
  }),
  mode: z.object({ mode: z.enum(['retail', 'restaurant', 'hybrid']) }),
  administrator: z.object({
    adminUsername: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    adminDisplayName: z.string().trim().min(2).max(80)
  }),
  theme: z.object({ theme: z.enum(['dark', 'light', 'system']) }),
  register: z.object({
    registerName: z.string().trim().min(1).max(60),
    registerCode: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9-]+$/i),
    openingFloat: z.number().int().min(0)
  }),
  hardware: z.object({
    printerProfile: z.enum(['none', 'simulator']),
    cashDrawerProfile: z.enum(['none', 'simulator'])
  }),
  demoData: z.object({ demoData: z.boolean() })
}

const SETTINGS_KEY = 'app.onboarding'

/**
 * First-run setup wizard backend.
 *
 * - Progress is persisted after every step (crash/restart resumes in place).
 * - `finish` runs in a single IMMEDIATE transaction: either the whole
 *   organization/branch/register/admin/tax configuration exists, or none of
 *   it does. There is no observable half-configured state.
 * - The administrator password never touches persistent wizard state.
 * - Completing onboarding requires a restart so every service is rebuilt
 *   against the new branch (same pattern as backup restore).
 */
export class OnboardingService {
  constructor(private db: DB) {
    // Guarantee the prerequisites for finish() even on a database that was
    // migrated forward rather than freshly seeded.
    seedBase(this.db)
  }

  getState(): OnboardingState {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
      { value: string } | undefined
    if (!row) return onboardingStateSchema.parse({})
    const parsed = onboardingStateSchema.safeParse(JSON.parse(row.value))
    return parsed.success ? parsed.data : onboardingStateSchema.parse({})
  }

  isComplete(): boolean {
    return this.getState().status === 'complete'
  }

  private writeState(state: OnboardingState): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(SETTINGS_KEY, JSON.stringify(state))
  }

  /** Persist one validated wizard step. No-op after completion. */
  saveStep(stepId: string, stepIndex: number, data: Record<string, unknown>): OnboardingState {
    const current = this.getState()
    if (current.status === 'complete') {
      throw new AppError(ErrorCode.InvalidState, 'Onboarding is already complete.')
    }
    const schema = stepSchemas[stepId]
    if (!schema) throw new AppError(ErrorCode.Validation, `Unknown onboarding step: ${stepId}`)
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw new AppError(ErrorCode.Validation, `Invalid data for step "${stepId}"`, {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      })
    }
    const next: OnboardingState = {
      ...current,
      status: 'in_progress',
      stepIndex: Math.max(current.stepIndex, stepIndex),
      data: { ...current.data, ...(parsed.data as Record<string, unknown>) }
    }
    this.writeState(next)
    this.db
      .prepare(
        `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, context, created_at)
         VALUES (?, NULL, '/onboarding', ?, 'onboarding', ?, ?, ?)`
      )
      .run(newId(), 'onboarding.step', stepId, JSON.stringify({ stepIndex }), now())
    return next
  }

  /**
   * Finish onboarding: create the org structure, tax configuration, settings
   * and the administrator account in one transaction. Returns nothing —
   * the caller restarts the app on success.
   */
  finish(input: OnboardingFinishInput): void {
    const current = this.getState()
    if (current.status === 'complete') {
      throw new AppError(ErrorCode.InvalidState, 'Onboarding is already complete.')
    }
    // Full validation of the complete payload — the per-step drafts alone are
    // not trusted (steps may have been skipped via saveStep ordering bugs).
    const parsed = onboardingFinishSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(ErrorCode.Validation, 'Onboarding data is incomplete or invalid.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      })
    }
    const d = parsed.data
    const t = now()

    const tx = this.db.transaction(() => {
      const orgId = newId()
      this.db
        .prepare(
          `INSERT INTO organizations (id, name, legal_name, tax_id, currency, timezone, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orgId,
          d.businessName,
          d.legalName || null,
          d.taxId || null,
          d.currencyCode,
          d.timezone,
          t
        )

      const branchId = newId()
      this.db
        .prepare(
          `INSERT INTO branches (id, organization_id, name, code, address, phone)
           VALUES (?, ?, ?, 'MAIN', ?, ?)`
        )
        .run(branchId, orgId, d.businessName, d.address || null, d.phone || null)

      const registerId = newId()
      this.db
        .prepare(`INSERT INTO registers (id, branch_id, name, code) VALUES (?, ?, ?, ?)`)
        .run(registerId, branchId, d.registerName, d.registerCode.toUpperCase())

      this.db
        .prepare(
          `INSERT INTO terminals (id, branch_id, register_id, name, device_key)
           VALUES (?, ?, ?, 'Terminal 1', 'term-local-01')`
        )
        .run(newId(), branchId, registerId)

      // Taxes
      this.db
        .prepare(
          `INSERT INTO taxes (id, name, rate_bps, inclusive, is_default) VALUES (?, ?, ?, ?, 1)`
        )
        .run(newId(), d.taxName, d.taxRateBps, d.taxInclusive ? 1 : 0)
      if (d.taxRateBps > 0) {
        this.db
          .prepare(
            `INSERT INTO taxes (id, name, rate_bps, inclusive, is_default) VALUES (?, 'Exempt', 0, 0, 0)`
          )
          .run(newId())
      }

      // Administrator (system role lives in seedBase output)
      const adminRole = this.db
        .prepare(`SELECT id FROM roles WHERE name = 'Administrator'`)
        .get() as { id: string } | undefined
      if (!adminRole)
        throw new AppError(ErrorCode.Internal, 'System roles missing — base seed failed.')
      const adminId = newId()
      this.db
        .prepare(
          `INSERT INTO users (id, username, display_name, password_hash, pin_hash, role_id, branch_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          adminId,
          d.adminUsername,
          d.adminDisplayName,
          hashPassword(d.adminPassword),
          hashPassword(d.adminPin),
          adminRole.id,
          branchId,
          t
        )

      // Opening float: open the first shift immediately so the wizard's
      // promise (a drawer containing `openingFloat`) matches reality.
      if (d.openingFloat > 0) {
        this.db
          .prepare(
            `INSERT INTO shifts (id, branch_id, register_id, user_id, opening_float, opened_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(newId(), branchId, registerId, adminId, d.openingFloat, t)
      }

      // Settings — each validated against the shared registry shape
      const setSetting = this.db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      setSetting.run(
        'app.business',
        JSON.stringify({
          name: d.businessName,
          legalName: d.legalName,
          address: d.address,
          phone: d.phone,
          email: d.email,
          taxId: d.taxId,
          logoPath: ''
        })
      )
      setSetting.run(
        'app.localization',
        JSON.stringify({
          language: d.language,
          timezone: d.timezone,
          dateFormat: 'YYYY-MM-DD',
          timeFormat: '24h'
        })
      )
      setSetting.run(
        'app.currency',
        JSON.stringify({
          code: d.currencyCode,
          symbolPosition: d.symbolPosition,
          thousandsSeparator: ',',
          decimalSeparator: '.'
        })
      )
      setSetting.run('app.theme', JSON.stringify(d.theme))
      const posRow = this.db.prepare(`SELECT value FROM settings WHERE key = 'app.pos'`).get() as
        { value: string } | undefined
      const pos = posRow ? (JSON.parse(posRow.value) as Record<string, unknown>) : {}
      setSetting.run(
        'app.pos',
        JSON.stringify({
          ...pos,
          mode: d.mode,
          defaultOrderType: d.mode === 'restaurant' ? 'dine_in' : 'retail'
        })
      )
      setSetting.run(
        'app.hardware',
        JSON.stringify({
          printer: d.printerProfile,
          cashDrawer: d.cashDrawerProfile,
          customerDisplay: false
        } satisfies z.infer<typeof hardwareSettingsSchema>)
      )

      // Optional demo catalog (products, menu, customers, history) for this branch
      if (d.demoData) seedDemoCatalog(this.db, branchId)

      const finalState: OnboardingState = {
        status: 'complete',
        stepIndex: 0,
        data: { ...current.data, ...d, adminCreated: true } as OnboardingData,
        completedAt: t,
        demo: d.demoData
      }
      // Never persist secrets — scrub explicitly even though only whitelisted keys exist.
      const {
        adminPassword: _pw,
        adminPin: _pin,
        ...safe
      } = finalState.data as Record<string, unknown>
      this.db
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(SETTINGS_KEY, JSON.stringify({ ...finalState, data: safe }))

      this.db
        .prepare(
          `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, branch_id, context, created_at)
           VALUES (?, ?, 'system', 'onboarding.complete', 'organization', ?, ?, ?, ?)`
        )
        .run(
          newId(),
          adminId,
          orgId,
          branchId,
          JSON.stringify({
            businessName: d.businessName,
            currency: d.currencyCode,
            mode: d.mode,
            demo: d.demoData,
            openingFloat: d.openingFloat
          }),
          t
        )
    })
    tx.immediate()
  }
}
