import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { ur } from './locales/ur'
import { applyDirection } from '../lib/rtl'

export { SUPPORTED_LANGUAGES, isRtl, type SupportedLanguage } from '../lib/rtl'

const CACHE_KEY = 'apexpos-language'

// Use the cached language synchronously to avoid a flash of the wrong
// language/direction; hydrated from settings once the app shell mounts.
const initial = localStorage.getItem(CACHE_KEY) ?? 'en'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ur: { translation: ur }
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
})

applyDirection(initial)

i18n.on('languageChanged', (lang) => {
  localStorage.setItem(CACHE_KEY, lang)
  applyDirection(lang)
})

/** Persisted setting ↔ runtime language. */
export const setAppLanguage = async (lang: string): Promise<void> => {
  await i18n.changeLanguage(lang)
}

export default i18n
