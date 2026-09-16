import { useEffect } from 'react'
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

export default function App(): React.ReactElement {
  const { session, locked, setSession } = useSessionStore()
  const loadTheme = useThemeStore((s) => s.load)

  useEffect(() => {
    void loadTheme()
    void window.api.auth.session().then((r) => {
      if (r.ok && r.data) setSession(r.data)
    })
  }, [loadTheme, setSession])

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
