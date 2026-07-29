import { createClient } from '@base44/sdk'

export const base44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID || '6a5ffe64a6fdab24b1ac1c26',
})

// Dev-only: exposes the client on window so RLS/permission issues can be diagnosed
// directly from the browser console against the real logged-in session.
if (import.meta.env.DEV) {
  window.base44 = base44
}
