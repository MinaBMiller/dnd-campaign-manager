import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'

export default function LoginPage() {
  const { login, register, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'verify'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        navigate('/campaigns')
      } else if (mode === 'register') {
        await register(email, password)
        setMode('verify')
      } else if (mode === 'verify') {
        await verifyOtp(email, otpCode)
        await login(email, password)
        navigate('/campaigns')
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-amber-400">D&D Campaign Manager</h1>
        <p className="mb-6 text-sm text-slate-400">
          {mode === 'login' && 'Sign in to your campaigns'}
          {mode === 'register' && 'Create an account'}
          {mode === 'verify' && `Enter the code sent to ${email}`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'verify' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          {mode === 'verify' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Verification code</label>
              <input
                type="text"
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm tracking-widest outline-none focus:border-amber-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-amber-500 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {mode === 'login' && (busy ? 'Signing in…' : 'Sign in')}
            {mode === 'register' && (busy ? 'Creating…' : 'Create account')}
            {mode === 'verify' && (busy ? 'Verifying…' : 'Verify & sign in')}
          </button>
        </form>

        {mode === 'login' && (
          <p className="mt-4 text-center text-sm text-slate-400">
            No account?{' '}
            <button className="text-amber-400 hover:underline" onClick={() => setMode('register')}>
              Register
            </button>
          </p>
        )}
        {mode === 'register' && (
          <p className="mt-4 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <button className="text-amber-400 hover:underline" onClick={() => setMode('login')}>
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
