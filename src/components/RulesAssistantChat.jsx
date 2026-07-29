import { useEffect, useRef, useState } from 'react'
import { base44 } from '../base44Client'

export default function RulesAssistantChat({ campaign, user }) {
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const storageKey = `rules-assistant-conversation:${campaign.id}:${user.email}`
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || conversation) return
    let unsubscribe
    ;(async () => {
      try {
        const savedId = localStorage.getItem(storageKey)
        let conv = savedId ? await base44.agents.getConversation(savedId).catch(() => null) : null
        if (!conv) {
          conv = await base44.agents.createConversation({
            agent_name: 'rules_assistant',
            metadata: { campaign_id: campaign.id },
          })
          localStorage.setItem(storageKey, conv.id)
        }
        setConversation(conv)
        unsubscribe = base44.agents.subscribeToConversation(conv.id, (updated) => setConversation(updated))
      } catch (err) {
        setError(err?.response?.data?.message || err.message)
      }
    })()
    return () => unsubscribe?.()
  }, [open, campaign.id, conversation, storageKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages?.length])

  // Polling fallback alongside subscribeToConversation — same reliability gap
  // observed with entity subscribe() elsewhere in this app; the agent's reply can
  // take several seconds to generate, and without this it only ever showed up after
  // a full page reload.
  useEffect(() => {
    if (!open || !conversation) return undefined
    let cancelled = false
    const id = setInterval(async () => {
      try {
        const updated = await base44.agents.getConversation(conversation.id)
        if (!cancelled && updated) setConversation(updated)
      } catch {
        // transient — next tick will retry
      }
    }, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open, conversation?.id])

  async function handleSend(e) {
    e.preventDefault()
    if (!message.trim() || !conversation) return
    setSending(true)
    setError('')
    try {
      const isFirstMessage = (conversation.messages?.length ?? 0) === 0
      const content = isFirstMessage ? `Campaign: ${campaign.id} - ${campaign.name}. ${message.trim()}` : message.trim()
      await base44.agents.addMessage(conversation, { role: 'user', content })
      setMessage('')
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold text-amber-400"
      >
        <span>Ask about the rules</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3">
          <p className="mb-2 text-xs text-slate-500">Private to you — ask "can I do X" or general rules questions.</p>
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <div className="mb-2 max-h-64 space-y-2 overflow-y-auto">
            {!conversation && !error && <p className="text-xs text-slate-500">Connecting…</p>}
            {conversation?.messages
              ?.filter((m) => m.role !== 'system' && m.content)
              .map((m) => (
                <div key={m.id} className="text-sm">
                  <span className={m.role === 'user' ? 'font-semibold text-slate-300' : 'font-semibold text-amber-300'}>
                    {m.role === 'user' ? 'You' : 'Rules'}:{' '}
                  </span>
                  <span className="text-slate-200">{typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}</span>
                </div>
              ))}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Can I do X? What's the rule for…?"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={sending || !conversation}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
