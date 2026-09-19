/**
 * RTL utilities - separate from i18n and theme to avoid circular deps.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', rtl: false },
  { code: 'ur', label: 'اردو', rtl: true }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code']

export const isRtl = (lang: string): boolean =>
  SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.rtl ?? false

export const applyDirection = (lang: string): void => {
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}
