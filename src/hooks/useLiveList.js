import { useEffect, useRef, useState } from 'react'
import { base44 } from '../base44Client'

const POLL_INTERVAL_MS = 8000
const MAX_BACKOFF_MS = 30000

/** Loads all records of `entityName` for a campaign, then keeps them live.
 *
 * Uses entities.subscribe() for low-latency updates when it works, PLUS a polling
 * fallback via filter() every few seconds — because subscribe() delivery appears to
 * have the same reliability gap observed elsewhere in this app's RLS evaluation
 * (query-time reads via filter()/get() are reliably correct for any campaign member,
 * but confirmed empirically that other array-field RLS checks — e.g. LogEntry create
 * — silently fail for non-DM users even with correct data; real-time delivery likely
 * shares that code path). Polling guarantees eventual correctness for everyone
 * regardless of role; subscribe() is a latency optimization on top, not the only path.
 *
 * A campaign room mounts several of these at once (Character, NPC, Encounter,
 * LogEntry, QuestFlag, DirectMessage, Campaign), so each instance starts on a random
 * jitter offset to avoid every poll firing in lockstep, and backs off on 429s instead
 * of hammering the API — confirmed empirically that un-jittered polling across that
 * many concurrent lists triggers rate limiting.
 *
 * subscribe() fires for every record of that entity across the whole app (it isn't
 * query-scoped), so events are filtered client-side by campaign_id and merged in. */
export function useLiveList(entityName, campaignId, { sort = '-created_date' } = {}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const itemsRef = useRef([])

  useEffect(() => {
    if (!campaignId) return undefined
    let cancelled = false
    let timeoutId
    let backoff = POLL_INTERVAL_MS

    async function load() {
      try {
        const data = await base44.entities[entityName].filter({ campaign_id: campaignId }, sort, 500)
        if (cancelled) return
        itemsRef.current = data
        setItems(data)
        setLoading(false)
        backoff = POLL_INTERVAL_MS
      } catch {
        // Rate limits / transient errors: skip this cycle and back off — the next
        // successful poll (or a live subscribe event) will catch up.
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      } finally {
        // Jitter only the recurring schedule, not the first fetch, so mounting
        // several of these at once doesn't leave the page blank while staggering.
        if (!cancelled) timeoutId = setTimeout(load, backoff + Math.random() * 2000)
      }
    }

    load()

    const unsubscribe = base44.entities[entityName].subscribe((event) => {
      if (!event?.data || event.data.campaign_id !== campaignId) return
      const current = itemsRef.current
      let next
      if (event.type === 'delete') {
        next = current.filter((item) => item.id !== event.id)
      } else {
        // event.data doesn't reliably carry created_date the way a fetched record
        // does, which was sorting new arrivals into the wrong position until the next
        // poll silently corrected it — fall back to the event's own timestamp so
        // ordering is right immediately.
        const record = { created_date: event.timestamp, updated_date: event.timestamp, ...event.data, id: event.id }
        const exists = current.some((item) => item.id === event.id)
        next = exists ? current.map((item) => (item.id === event.id ? record : item)) : [...current, record]
      }
      itemsRef.current = next
      setItems(next)
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [entityName, campaignId, sort])

  return { items, loading }
}
