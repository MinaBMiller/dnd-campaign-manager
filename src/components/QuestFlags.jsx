import { useState } from 'react'
import { base44 } from '../base44Client'
import { isDm } from '../utils/campaignStamp'

export default function QuestFlags({ campaign, user, flags, viewAsPlayer = false }) {
  const dm = isDm(campaign, user) && !viewAsPlayer
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    if (!key.trim()) return
    setError('')
    try {
      // Fetch fresh rather than trusting the campaign prop — see LogFeed.jsx for why.
      const fresh = await base44.entities.Campaign.get(campaign.id)
      await base44.entities.QuestFlag.create({
        campaign_id: campaign.id,
        dm_email: fresh.dm_email,
        party_emails: fresh.player_emails ?? [],
        flag_key: key.trim(),
        flag_value: value.trim(),
        flag_type: 'text',
      })
      setKey('')
      setValue('')
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    }
  }

  if (!dm && flags.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Quest flags</p>
      <ul className="mb-2 space-y-1">
        {flags.map((f) => (
          <li key={f.id} className="flex justify-between text-xs text-slate-300">
            <span>{f.flag_key}</span>
            <span className="text-slate-500">{f.flag_value}</span>
          </li>
        ))}
      </ul>
      {dm && (
        <form onSubmit={handleAdd} className="flex gap-1">
          <input
            placeholder="flag key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          />
          <input
            placeholder="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded bg-slate-700 px-2 text-xs hover:bg-slate-600">
            +
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
