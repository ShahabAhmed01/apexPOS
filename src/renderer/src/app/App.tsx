import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessionStore'
import { useThemeStore } from '../stores/themeStore'
import { LoginScreen } from '../features/auth/LoginScreen'
import { LockScreen } from '../features/auth/LockScreen'
import { AppShell } from '../layouts/AppShell'
import { PosScreen } from '../features/pos/PosScreen'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { InventoryScreen } from '../features/inventory/InventoryScreen'
import { FloorScreen } from '../features/restaurant/FloorScreen'
import { KitchenScreen } from '../features/restaurant/KitchenScreen'
import { CustomersScreen } from '../features/customers/CustomersScreen'
import { ReportsScreen } from '../features/reports/ReportsScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { CustomerDisplayScreen } from '../features/display/CustomerDisplayScreen'
import { OnboardingWizard } from '../features/onboarding/OnboardingWizard'
import '../i18n'

const isCustomerDisplay = new URLSearchParams(window.location.search).get('display') === 'customer'

export default function App(): React.ReactElement {
  const { session, locked, setSession } = useSessionStore()
  const loadTheme = useThemeStore((s) => s.load)
  // null = still probing; gates the first paint so a fresh install never
  // flashes the login screen before the wizard takes over.
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)

  useEffect(() => {
    void loadTheme()
    if (isCustomerDisplay) return // display window needs no session
    void window.api.app.info().then((r) => {
      if (r.ok) setOnboardingComplete(r.data.onboardingComplete)
    })
    void window.api.auth.session().then((r) => {
      if (r.ok && r.data) setSession(r.data)
    })
  }, [loadTheme, setSession])

  if (isCustomerDisplay) return <CustomerDisplayScreen />
  if (onboardingComplete === null) return <div className="h-full bg-[var(--color-bg-0)]" />
  if (!onboardingComplete) return <OnboardingWizard />
  if (!session) return <LoginScreen />
  if (locked) return <LockScreen />

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/pos" replace />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/pos" element={<PosScreen />} />
          <Route path="/inventory" element={<InventoryScreen />} />
          <Route path="/floor" element={<FloorScreen />} />
          <Route path="/kitchen" element={<KitchenScreen />} />
          <Route path="/customers" element={<CustomersScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
