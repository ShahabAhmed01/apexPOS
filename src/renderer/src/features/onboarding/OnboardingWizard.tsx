import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { Input } from '../../design-system/Input'
import { Select } from '../../design-system/Select'
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../../i18n'
import type { OnboardingFinishInput, OnboardingState } from '@shared/ipc/api'

interface Secrets {
  adminPassword: string
  adminPasswordConfirm: string
  adminPin: string
  adminPinConfirm: string
}

type WizardData = Omit<
  OnboardingFinishInput,
  'adminPassword' | 'adminPin' | 'openingFloat' | 'taxRateBps'
> & {
  openingFloatText: string
  taxRatePercent: string
}

const COUNTRIES = [
  { value: 'PK', label: 'Pakistan' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'TR', label: 'Türkiye' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'QA', label: 'Qatar' }
]

const TIMEZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kuala_Lumpur',
  'Europe/Istanbul',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'Australia/Sydney',
  'UTC'
].map((v) => ({ value: v, label: v }))

const STEP_IDS = [
  'business',
  'locale',
  'currency',
  'tax',
  'mode',
  'administrator',
  'theme',
  'register',
  'hardware',
  'demoData',
  'review'
] as const

type StepId = (typeof STEP_IDS)[number]

/** Convert the wizard's percent text (e.g. "18" or "17.5") to integer bps. */
const percentToBps = (text: string): number | null => {
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  const bps = Math.round(n * 100)
  if (Math.abs(bps / 100 - n) > 1e-9) return null // more than 2 decimals
  return bps
}

export const OnboardingWizard = (): React.ReactElement => {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [secrets, setSecrets] = useState<Secrets>({
    adminPassword: '',
    adminPasswordConfirm: '',
    adminPin: '',
    adminPinConfirm: ''
  })
  const [data, setData] = useState<WizardData>({
    businessName: '',
    legalName: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    country: 'PK',
    language: 'en',
    currencyCode: 'PKR',
    symbolPosition: 'before',
    timezone: 'Asia/Karachi',
    taxName: 'Sales Tax',
    taxRatePercent: '18',
    taxInclusive: false,
    mode: 'hybrid',
    adminUsername: '',
    adminDisplayName: '',
    theme: 'dark',
    registerName: 'Front Counter',
    registerCode: 'REG-01',
    openingFloatText: '0',
    printerProfile: 'simulator',
    cashDrawerProfile: 'simulator',
    demoData: false
  })

  // Resume: server-side state wins over whatever the renderer remembers.
  useEffect(() => {
    void window.api.onboarding.state().then((r) => {
      if (!r.ok) return
      const s: OnboardingState = r.data
      if (s.status === 'complete') {
        setDone(true)
        return
      }
      if (s.status === 'in_progress') {
        setData((prev) => ({
          ...prev,
          ...s.data,
          taxRatePercent:
            s.data.taxRateBps !== undefined ? String(s.data.taxRateBps / 100) : prev.taxRatePercent,
          openingFloatText:
            s.data.openingFloat !== undefined ? String(s.data.openingFloat / 100) : '0'
        }))
        setStepIndex(Math.min(s.stepIndex + 1, STEP_IDS.length - 1))
      }
    })
  }, [])

  const update = (patch: Partial<WizardData>): void => setData((d) => ({ ...d, ...patch }))
  const stepId = STEP_IDS[stepIndex]!

  /** Client-side gate — the server re-validates authoritatively. */
  const validateStep = (): string | null => {
    switch (stepId) {
      case 'business':
        return data.businessName.trim().length >= 2 ? null : t('onboarding.validationFailed')
      case 'locale':
        return data.country && data.timezone ? null : t('onboarding.validationFailed')
      case 'currency':
        return /^[A-Z]{3}$/.test(data.currencyCode) ? null : t('onboarding.validationFailed')
      case 'tax':
        return data.taxName.trim() && percentToBps(data.taxRatePercent) !== null
          ? null
          : t('onboarding.validationFailed')
      case 'administrator': {
        if (data.adminUsername.trim().length < 3 || data.adminDisplayName.trim().length < 2)
          return t('onboarding.validationFailed')
        if (secrets.adminPassword.length < 8) return t('onboarding.validationFailed')
        if (secrets.adminPassword !== secrets.adminPasswordConfirm)
          return t('onboarding.administrator.mismatchPassword')
        if (!/^\d{4,8}$/.test(secrets.adminPin)) return t('onboarding.validationFailed')
        if (secrets.adminPin !== secrets.adminPinConfirm)
          return t('onboarding.administrator.mismatchPin')
        return null
      }
      case 'register':
        return data.registerName.trim() && data.registerCode.trim()
          ? null
          : t('onboarding.validationFailed')
      default:
        return null
    }
  }

  const finishPayload = (): OnboardingFinishInput => ({
    ...data,
    taxRateBps: percentToBps(data.taxRatePercent) ?? 0,
    adminPassword: secrets.adminPassword,
    adminPin: secrets.adminPin,
    openingFloat: Math.round(Number(data.openingFloatText || '0') * 100)
  })

  const next = async (): Promise<void> => {
    const invalid = validateStep()
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (stepId === 'review') {
        const fin = await window.api.onboarding.finish(finishPayload())
        if (!fin.ok) {
          setError(fin.error.message)
          return
        }
        setDone(true)
        return
      }

      // Persist non-secret step data (not for review)
      const saveData: Record<string, unknown> = {}
      const relevant: Record<string, unknown> = { ...data }
      delete (relevant as Record<string, unknown>).taxRatePercent
      delete (relevant as Record<string, unknown>).openingFloatText
      if (stepId === 'tax') {
        relevant.taxRateBps = percentToBps(data.taxRatePercent)
      }
      if (stepId === 'register') {
        relevant.openingFloat = Math.round(Number(data.openingFloatText || '0') * 100)
      }
      Object.assign(
        saveData,
        Object.fromEntries(Object.entries(relevant).filter(([, v]) => v !== undefined))
      )
      const res = await window.api.onboarding.saveStep(stepId, stepIndex, saveData)
      if (!res.ok) {
        setError(res.error.message)
        return
      }

      setStepIndex((i) => i + 1)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell stepIndex={STEP_IDS.length - 1} title={t('onboarding.complete.title')}>
        <p className="text-sm text-[var(--color-text-1)]">{t('onboarding.complete.body')}</p>
        <Button size="lg" className="mt-4" onClick={() => void window.api.app.restart()}>
          {t('onboarding.complete.restart')}
        </Button>
      </Shell>
    )
  }

  return (
    <Shell stepIndex={stepIndex} title={titleFor(stepId, t)}>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {stepId === 'business' && (
        <div className="space-y-3">
          <Input
            label={t('onboarding.business.name')}
            value={data.businessName}
            required
            onChange={(e) => update({ businessName: e.target.value })}
            autoFocus
          />
          <Input
            label={t('onboarding.business.legalName')}
            value={data.legalName}
            onChange={(e) => update({ legalName: e.target.value })}
          />
          <Input
            label={t('onboarding.business.address')}
            value={data.address}
            onChange={(e) => update({ address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('onboarding.business.phone')}
              value={data.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
            <Input
              label={t('onboarding.business.email')}
              type="email"
              value={data.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
          <Input
            label={t('onboarding.business.taxId')}
            value={data.taxId}
            onChange={(e) => update({ taxId: e.target.value })}
          />
        </div>
      )}

      {stepId === 'locale' && (
        <div className="space-y-3">
          <Select
            label={t('onboarding.locale.country')}
            value={data.country}
            options={COUNTRIES}
            onChange={(v) => update({ country: v })}
          />
          <Select
            label={t('onboarding.locale.language')}
            value={data.language}
            options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            onChange={(v) => {
              update({ language: v })
              void setAppLanguage(v) // live preview — also exercises RTL early
            }}
          />
          <Select
            label={t('onboarding.locale.timezone')}
            value={data.timezone}
            options={TIMEZONES}
            onChange={(v) => update({ timezone: v })}
          />
        </div>
      )}

      {stepId === 'currency' && (
        <div className="space-y-3">
          <Input
            label={t('onboarding.currency.code')}
            value={data.currencyCode}
            maxLength={3}
            hint={t('onboarding.currency.codeHint')}
            onChange={(e) => update({ currencyCode: e.target.value.toUpperCase() })}
          />
          <Select
            label={t('onboarding.currency.symbolPosition')}
            value={data.symbolPosition}
            options={[
              { value: 'before', label: t('onboarding.currency.before') },
              { value: 'after', label: t('onboarding.currency.after') }
            ]}
            onChange={(v) => update({ symbolPosition: v as 'before' | 'after' })}
          />
        </div>
      )}

      {stepId === 'tax' && (
        <div className="space-y-3">
          <Input
            label={t('onboarding.tax.name')}
            value={data.taxName}
            onChange={(e) => update({ taxName: e.target.value })}
          />
          <Input
            label={t('onboarding.tax.rate')}
            inputMode="decimal"
            value={data.taxRatePercent}
            onChange={(e) => update({ taxRatePercent: e.target.value })}
          />
          <div className="flex gap-2 pt-1" role="radiogroup" aria-label={t('onboarding.tax.title')}>
            {(['exclusive', 'inclusive'] as const).map((k) => (
              <label
                key={k}
                className={`flex-1 cursor-pointer rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                  (k === 'inclusive') === data.taxInclusive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <input
                  type="radio"
                  name="taxmode"
                  className="sr-only"
                  checked={(k === 'inclusive') === data.taxInclusive}
                  onChange={() => update({ taxInclusive: k === 'inclusive' })}
                />
                {k === 'inclusive' ? t('onboarding.tax.inclusive') : t('onboarding.tax.exclusive')}
              </label>
            ))}
          </div>
        </div>
      )}

      {stepId === 'mode' && (
        <div
          className="grid grid-cols-3 gap-3"
          role="radiogroup"
          aria-label={t('onboarding.mode.title')}
        >
          {(['retail', 'restaurant', 'hybrid'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ mode: m })}
              aria-pressed={data.mode === m}
              className={`rounded-[var(--radius-md)] border p-4 text-start ${
                data.mode === m
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-2)]'
              }`}
            >
              <div className="font-medium">{t(`onboarding.mode.${m}`)}</div>
              <div className="mt-1 text-xs text-[var(--color-text-1)]">
                {t(`onboarding.mode.${m}Hint`)}
              </div>
            </button>
          ))}
        </div>
      )}

      {stepId === 'administrator' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('onboarding.administrator.username')}
              value={data.adminUsername}
              autoComplete="off"
              onChange={(e) => update({ adminUsername: e.target.value })}
            />
            <Input
              label={t('onboarding.administrator.displayName')}
              value={data.adminDisplayName}
              onChange={(e) => update({ adminDisplayName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('onboarding.administrator.password')}
              type="password"
              autoComplete="new-password"
              value={secrets.adminPassword}
              onChange={(e) => setSecrets((s) => ({ ...s, adminPassword: e.target.value }))}
            />
            <Input
              label={t('onboarding.administrator.passwordConfirm')}
              type="password"
              autoComplete="new-password"
              value={secrets.adminPasswordConfirm}
              onChange={(e) => setSecrets((s) => ({ ...s, adminPasswordConfirm: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('onboarding.administrator.pin')}
              type="password"
              inputMode="numeric"
              value={secrets.adminPin}
              onChange={(e) => setSecrets((s) => ({ ...s, adminPin: e.target.value }))}
            />
            <Input
              label={t('onboarding.administrator.pinConfirm')}
              type="password"
              inputMode="numeric"
              value={secrets.adminPinConfirm}
              onChange={(e) => setSecrets((s) => ({ ...s, adminPinConfirm: e.target.value }))}
            />
          </div>
          <p className="text-xs text-[var(--color-text-2)]">{t('onboarding.administrator.hint')}</p>
        </div>
      )}

      {stepId === 'theme' && (
        <div className="flex gap-3" role="radiogroup" aria-label={t('onboarding.theme.title')}>
          {(['dark', 'light', 'system'] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => update({ theme: th })}
              aria-pressed={data.theme === th}
              className={`flex-1 rounded-[var(--radius-md)] border p-4 ${
                data.theme === th
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-2)]'
              }`}
            >
              {t(`onboarding.theme.${th}`)}
            </button>
          ))}
        </div>
      )}

      {stepId === 'register' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('onboarding.register.name')}
              value={data.registerName}
              onChange={(e) => update({ registerName: e.target.value })}
            />
            <Input
              label={t('onboarding.register.code')}
              value={data.registerCode}
              onChange={(e) => update({ registerCode: e.target.value })}
            />
          </div>
          <Input
            label={t('onboarding.register.openingFloat')}
            inputMode="decimal"
            value={data.openingFloatText}
            onChange={(e) => update({ openingFloatText: e.target.value })}
          />
          <p className="text-xs text-[var(--color-text-2)]">{t('onboarding.register.hint')}</p>
        </div>
      )}

      {stepId === 'hardware' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-1)]">{t('onboarding.hardware.subtitle')}</p>
          <Select
            label={t('onboarding.hardware.printer')}
            value={data.printerProfile}
            options={[
              { value: 'simulator', label: t('onboarding.hardware.simulator') },
              { value: 'none', label: t('onboarding.hardware.none') }
            ]}
            onChange={(v) => update({ printerProfile: v as 'none' | 'simulator' })}
          />
          <Select
            label={t('onboarding.hardware.drawer')}
            value={data.cashDrawerProfile}
            options={[
              { value: 'simulator', label: t('onboarding.hardware.simulator') },
              { value: 'none', label: t('onboarding.hardware.none') }
            ]}
            onChange={(v) => update({ cashDrawerProfile: v as 'none' | 'simulator' })}
          />
        </div>
      )}

      {stepId === 'demoData' && (
        <div className="space-y-3" role="radiogroup" aria-label={t('onboarding.demo.title')}>
          {[
            { v: true, label: t('onboarding.demo.load') },
            { v: false, label: t('onboarding.demo.skip') }
          ].map((o) => (
            <label
              key={String(o.v)}
              className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border p-4 text-sm ${
                data.demoData === o.v
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border)]'
              }`}
            >
              <input
                type="radio"
                name="demo"
                className="sr-only"
                checked={data.demoData === o.v}
                onChange={() => update({ demoData: o.v })}
              />
              {o.label}
            </label>
          ))}
          <p className="text-xs text-[var(--color-text-2)]">{t('onboarding.demo.hint')}</p>
        </div>
      )}

      {stepId === 'review' && <Review data={data} />}

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          disabled={stepIndex === 0 || busy}
          onClick={() => setStepIndex((i) => i - 1)}
        >
          {t('common.back')}
        </Button>
        <Button onClick={() => void next()} loading={busy}>
          {stepId === 'review' ? t('common.finish') : t('common.next')}
        </Button>
      </div>
    </Shell>
  )
}

const titleFor = (stepId: StepId, t: (k: string) => string): string => {
  if (stepId === 'review') return t('onboarding.complete.title')
  return t(`onboarding.${stepId === 'demoData' ? 'demo' : stepId}.title`)
}

const Review = ({ data }: { data: WizardData }): React.ReactElement => {
  const { t } = useTranslation()
  const rows: [string, string][] = [
    [t('onboarding.business.title'), data.businessName],
    [t('onboarding.locale.title'), `${data.country} · ${data.language} · ${data.timezone}`],
    [t('onboarding.currency.title'), data.currencyCode],
    [t('onboarding.tax.title'), `${data.taxName} ${data.taxRatePercent}%`],
    [t('onboarding.mode.title'), t(`onboarding.mode.${data.mode}`)],
    [t('onboarding.administrator.title'), `${data.adminDisplayName} (${data.adminUsername})`],
    [t('onboarding.register.title'), `${data.registerName} (${data.registerCode})`],
    [t('onboarding.hardware.title'), data.printerProfile],
    [t('onboarding.demo.title'), data.demoData ? '✓' : '—']
  ]
  return (
    <dl className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-4 py-2.5">
          <dt className="text-xs text-[var(--color-text-1)]">{k}</dt>
          <dd className="text-sm font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const Shell = ({
  stepIndex,
  title,
  children
}: {
  stepIndex: number
  title: string
  children: React.ReactNode
}): React.ReactElement => {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[var(--color-bg-0)] p-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-solid)] text-xl font-bold text-white">
            A
          </div>
          <h1 className="text-2xl font-semibold">{t('onboarding.title')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-1)]">{t('onboarding.subtitle')}</p>
        </div>

        <ol className="mb-6 flex items-center justify-center gap-1.5" aria-hidden>
          {STEP_IDS.map((id, i) => (
            <li
              key={id}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                i < stepIndex
                  ? 'bg-[var(--color-success)] text-[#0b0e13]'
                  : i === stepIndex
                    ? 'bg-[var(--color-accent-solid)] text-white'
                    : 'bg-[var(--color-bg-2)] text-[var(--color-text-2)]'
              }`}
            >
              {i < stepIndex ? <Check size={12} /> : i + 1}
            </li>
          ))}
        </ol>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-6">
          <h2 className="mb-4 text-lg font-semibold">{title}</h2>
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--color-text-2)]">
          {t('onboarding.step', { current: stepIndex + 1, total: STEP_IDS.length })}
        </p>
      </div>
    </div>
  )
}
