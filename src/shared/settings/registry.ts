import { z } from 'zod'

/**
 * Settings registry — single source of truth for all application settings,
 * their defaults, and their validation schemas. The settings table stores
 * key → JSON; this registry validates on read/write.
 *
 * Organized by section for the Settings UI.
 */

export const themeSchema = z.enum(['dark', 'light', 'system']).default('dark')
export type ThemePreference = z.infer<typeof themeSchema>

export const businessSettingsSchema = z.object({
  name: z.string().default('My Business'),
  legalName: z.string().default(''),
  address: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  taxId: z.string().default(''),
  logoPath: z.string().default('')
})

export const localizationSettingsSchema = z.object({
  language: z.string().default('en'),
  timezone: z.string().default('Asia/Karachi'),
  dateFormat: z.string().default('YYYY-MM-DD'),
  timeFormat: z.enum(['12h', '24h']).default('24h')
})

export const currencySettingsSchema = z.object({
  code: z.string().length(3).default('PKR'),
  symbolPosition: z.enum(['before', 'after']).default('before'),
  thousandsSeparator: z.string().default(','),
  decimalSeparator: z.string().default('.')
})

export const posSettingsSchema = z.object({
  mode: z.enum(['retail', 'restaurant', 'hybrid']).default('hybrid'),
  autoPrintReceipt: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(false),
  defaultOrderType: z.enum(['retail', 'dine_in', 'takeaway']).default('retail'),
  confirmOnClear: z.boolean().default(true),
  scanSound: z.boolean().default(true),
  quickKeysEnabled: z.boolean().default(true)
})

export const securitySettingsSchema = z.object({
  autoLockMinutes: z.number().int().min(0).max(240).default(5),
  sessionHours: z.number().int().min(1).max(72).default(12),
  maxLoginAttempts: z.number().int().min(3).max(10).default(5),
  lockoutMinutes: z.number().int().min(1).max(60).default(5)
})

export const settingsRegistry = {
  'app.theme': { schema: themeSchema, section: 'appearance' },
  'app.business': { schema: businessSettingsSchema, section: 'business' },
  'app.localization': { schema: localizationSettingsSchema, section: 'localization' },
  'app.currency': { schema: currencySettingsSchema, section: 'currency' },
  'app.pos': { schema: posSettingsSchema, section: 'pos' },
  'app.security': { schema: securitySettingsSchema, section: 'security' }
} as const

export type SettingKey = keyof typeof settingsRegistry

export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsRegistry)[K]['schema']>

export const defaultSettings = (): Record<SettingKey, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(settingsRegistry)) {
    // Object schemas parse {} via their own field defaults; enum schemas
    // need `undefined` so their .default() kicks in.
    let value: unknown
    try {
      value = def.schema.parse({})
    } catch {
      value = def.schema.parse(undefined)
    }
    out[key] = value
  }
  return out as Record<SettingKey, unknown>
}
