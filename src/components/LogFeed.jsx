import { useEffect, useRef, useState } from 'react'
import { base44 } from '../base44Client'

/** Pure party chat — just 'chat' entries. Mechanical/narrative events (dice, combat,
 * narration, system) live in the separate GameLog component instead, so casual party
 * banter doesn't get buried in — or clutter — the actual play-by-play. */
export default function LogFeed({ campaign, user, entries }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const sorted = entries
    .filter((e) => e.entry_type === 'chat')
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sorted.length])

  async function handleSend(e) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError('')
    try {
      // Routed through a function rather than a direct entities.LogEntry.create() call
      // — see send-chat-message/entry.ts for why (create-time RLS on array fields
      // proved unreliable for non-DM users).
      await base44.functions.invoke('send-chat-message', { campaign_id: campaign.id, content: message.trim() })
      setMessage('')
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[280px] flex-col rounded-lg border border-slate-800 bg-slate-900">
      <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Party chat
      </p>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
        {sorted.length === 0 && <p className="text-sm text-slate-600">No messages yet — say hello.</p>}
        {sorted.map((entry) => (
          <div key={entry.id} className="text-sm text-slate-200">
            <span className="font-semibold">{entry.author_label}: </span>
            {entry.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="px-3 text-xs text-red-400">{error}</p>}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-800 p-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something to the party…"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
