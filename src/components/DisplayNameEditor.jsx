import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'

export default function DisplayNameEditor() {
  const { user, updateDisplayName } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.username || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await updateDisplayName(name.trim())
      setEditing(false)
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:underline">
        {user.username ? `Playing as ${user.username}` : 'Set your username'}
      </button>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Username"
        className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs"
      />
      <button type="submit" disabled={busy} className="text-xs text-amber-400 hover:underline disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">
        Cancel
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  )
}
