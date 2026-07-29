import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { base44 } from './base44Client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await base44.auth.me()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = async (email, password) => {
    await base44.auth.loginViaEmailPassword(email, password)
    await refresh()
  }

  const register = async (email, password) => {
    await base44.auth.register({ email, password })
  }

  const verifyOtp = async (email, otpCode) => {
    await base44.auth.verifyOtp({ email, otpCode })
  }

  const logout = () => {
    setUser(null)
    base44.auth.logout(window.location.origin + '/login')
  }

  const updateDisplayName = async (username) => {
    // NOT full_name — confirmed empirically that field doesn't persist via
    // updateMe() for this app, even though it returns success. A real custom
    // field does persist correctly.
    await base44.auth.updateMe({ username })
    await refresh()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyOtp, logout, refresh, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
