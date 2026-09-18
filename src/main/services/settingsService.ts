import type { DB } from '../db/database'
import { settingsRegistry, defaultSettings, type SettingKey, type SettingValue } from '@shared/settings/registry'
import { AppError, ErrorCode } from '@shared/lib/errors'

/**
 * Typed settings store. All values are JSON in the settings table,
 * validated on write (and defensively on read) via the shared registry.
 */
export class SettingsService {
  constructor(private db: DB) {
    const tx = this.db.transaction(() => {
      const ins = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
      for (const [key, value] of Object.entries(defaultSettings())) {
        ins.run(key, JSON.stringify(value))
      }
    })
    tx.immediate()
  }

  get<K extends SettingKey>(key: K): SettingValue<K> {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    const def = settingsRegistry[key]
    if (!row) return def.schema.parse({}) as SettingValue<K>
    const parsed = def.schema.safeParse(JSON.parse(row.value))
    return (parsed.success ? parsed.data : def.schema.parse({})) as SettingValue<K>
  }

  set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
    const def = settingsRegistry[key]
    const parsed = def.schema.safeParse(value)
    if (!parsed.success) {
      throw new AppError(ErrorCode.Validation, `Invalid value for setting "${key}"`, parsed.error.flatten())
    }
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(parsed.data))
  }

  all(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(settingsRegistry) as SettingKey[]) {
      out[key] = this.get(key)
    }
    return out
  }
}
