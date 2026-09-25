import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import App from './App'
import '@fontsource-variable/inter'
import '../styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)

// Test-only: when the app is launched with APEXPOS_AXE=1, expose axe-core as a
// lazy chunk so accessibility E2E can run real audits without violating CSP.
void window.api.app
  .info()
  .then((r) => {
    if (r.ok && r.data.axeTestHooks) {
      return import('axe-core').then((axe) => {
        ;(window as unknown as { __axe: typeof axe }).__axe = axe
      })
    }
    return
  })
  .catch(() => undefined)
