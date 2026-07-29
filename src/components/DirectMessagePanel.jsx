import { useCallback, useEffect, useRef, useState } from 'react'
import { base44 } from '../base44Client'
import { useLiveList } from '../hooks/useLiveList'
import { isDm } from '../utils/campaignStamp'

function useLastSeen(storageKey) {
  const markSeen = useCallback(
    (iso) => {
      localStorage.setItem(storageKey, iso ?? new Date().toISOString())
    },
    [storageKey]
  )
  return markSeen
}

function countUnread(messages, viewerEmail, lastSeenIso) {
  const lastSeen = lastSeenIso ? new Date(lastSeenIso) : new Date(0)
  return messages.filter((m) => m.sender_email !== viewerEmail && new Date(m.created_date) > lastSeen).length
}

function latestTimestamp(messages) {
  return messages.reduce(
    (max, m) => (new Date(m.created_date) > new Date(max) ? m.created_date : max),
    new Date(0).toISOString()
  )
}

function Badge() {
  return <span className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
}

function Thread({ campaign, user, threadPlayerEmail, messages, label }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const markSeen = useLastSeen(`dm-thread-seen:${campaign.id}:${user.email}:${threadPlayerEmail}`)

  const sorted = [...messages].sort((a, b) => new Date(a.created_date) - new Date(b.created_date))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sorted.length])

  // This thread is the one actively being viewed (it's only rendered when selected/
  // open) — mark it read whenever its message set changes, covering both "just
  // opened" and "new message arrived while already open".
  useEffect(() => {
    if (sorted.length > 0) markSeen(latestTimestamp(sorted))
  }, [sorted.length, markSeen])

  async function handleSend(e) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError('')
    try {
      const [fresh, ownCharacters] = await Promise.all([
        base44.entities.Campaign.get(campaign.id),
        base44.entities.Character.filter({ campaign_id: campaign.id, user_email: user.email }),
      ])
      const displayName = user.username || user.email
      const character = ownCharacters[0]
      const sender_label = character ? `${character.name} (${displayName})` : displayName
      await base44.entities.DirectMessage.create({
        campaign_id: campaign.id,
        dm_email: fresh.dm_email,
        player_email: threadPlayerEmail,
        sender_email: user.email,
        sender_label,
        content: message.trim(),
      })
      setMessage('')
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-64 flex-col">
      <p className="mb-1 px-1 text-xs font-semibold text-slate-500">{label}</p>
      <div className="flex-1 space-y-1.5 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2">
        {sorted.length === 0 && <p className="text-xs text-slate-600">No messages yet.</p>}
        {sorted.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-semibold text-slate-300">{m.sender_label}: </span>
            <span className="text-slate-200">{m.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <form onSubmit={handleSend} className="mt-2 flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Private message…"
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

export default function DirectMessagePanel({ campaign, user }) {
  const [open, setOpen] = useState(false)
  const dm = isDm(campaign, user)
  const { items: messages } = useLiveList('DirectMessage', campaign.id)
  const [selectedPlayer, setSelectedPlayer] = useState('')

  const players = campaign.player_emails ?? []

  useEffect(() => {
    if (dm && !selectedPlayer && players.length > 0) setSelectedPlayer(players[0])
  }, [dm, selectedPlayer, players])

  const threadKeys = dm ? players : [user.email]
  const unreadByThread = {}
  for (const p of threadKeys) {
    const isActiveThread = open && ((dm && p === selectedPlayer) || (!dm && p === user.email))
    if (isActiveThread) {
      unreadByThread[p] = 0
      continue
    }
    const lastSeen = localStorage.getItem(`dm-thread-seen:${campaign.id}:${user.email}:${p}`)
    const threadMessages = messages.filter((m) => m.player_email === p)
    unreadByThread[p] = countUnread(threadMessages, user.email, lastSeen)
  }
  const anyUnread = Object.values(unreadByThread).some((n) => n > 0)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold text-amber-400"
      >
        <span className="flex items-center">
          {dm ? 'Private messages' : 'Message the DM'}
          {!open && anyUnread && <Badge />}
        </span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3">
          {dm ? (
            <>
              {players.length === 0 ? (
                <p className="text-xs text-slate-500">No players in this campaign yet.</p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {players.map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelectedPlayer(p)}
                        className={`flex items-center rounded px-2 py-1 text-xs ${
                          selectedPlayer === p
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {p}
                        {unreadByThread[p] > 0 && <Badge />}
                      </button>
                    ))}
                  </div>
                  {selectedPlayer && (
                    <Thread
                      key={selectedPlayer}
                      campaign={campaign}
                      user={user}
                      threadPlayerEmail={selectedPlayer}
                      messages={messages.filter((m) => m.player_email === selectedPlayer)}
                      label={`Private thread with ${selectedPlayer}`}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <Thread
              campaign={campaign}
              user={user}
              threadPlayerEmail={user.email}
              messages={messages.filter((m) => m.player_email === user.email)}
              label="Private thread with the DM"
            />
          )}
        </div>
      )}
    </div>
  )
}
