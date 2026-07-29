import { useState } from 'react'
import { base44 } from '../base44Client'

export default function SceneEditor({ campaign }) {
  const [editing, setEditing] = useState(false)
  const [scene, setScene] = useState(campaign.current_scene || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await base44.entities.Campaign.update(campaign.id, { current_scene: scene })
      setEditing(false)
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Current scene</p>
          <button onClick={() => setEditing(true)} className="text-xs text-amber-400 hover:underline">
            Edit
          </button>
        </div>
        <p className="text-sm text-slate-300">{campaign.current_scene || 'Not set yet.'}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-amber-700/50 bg-slate-900 p-4">
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Current scene</p>
      <textarea
        autoFocus
        value={scene}
        onChange={(e) => setScene(e.target.value)}
        rows={3}
        className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-amber-500"
      />
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setScene(campaign.current_scene || '')
            setEditing(false)
          }}
          className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
