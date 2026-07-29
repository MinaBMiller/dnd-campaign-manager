import { useState } from 'react'
import { base44 } from '../base44Client'

export default function DmNotes({ campaign }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(campaign.dm_notes || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(true)

  async function handleSave() {
    setBusy(true)
    setError('')
    try {
      await base44.entities.Campaign.update(campaign.id, { dm_notes: notes })
      setSaved(true)
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold text-amber-400"
      >
        <span>DM notes (private)</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3">
          <p className="mb-2 text-xs text-slate-500">Only you can see this — never shown to players.</p>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setSaved(false)
            }}
            rows={4}
            placeholder="Plot ideas, reminders, secrets…"
            className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-amber-500"
          />
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <button
            onClick={handleSave}
            disabled={busy || saved}
            className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {saved ? 'Saved' : busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
