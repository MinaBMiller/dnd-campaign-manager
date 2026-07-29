import { useEffect, useRef } from 'react'

const TYPE_STYLES = {
  system: 'text-slate-500 italic',
  dice: 'text-sky-400',
  narration: 'text-amber-300 italic',
  combat: 'text-red-400',
}

/** Read-only play-by-play: dice rolls, combat outcomes, narration, system messages —
 * everything except party chat, which lives in the separate LogFeed component. */
export default function GameLog({ entries }) {
  const bottomRef = useRef(null)

  const sorted = entries
    .filter((e) => e.entry_type !== 'chat')
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sorted.length])

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-slate-800 bg-slate-900">
      <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Game log
      </p>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
        {sorted.length === 0 && <p className="text-sm text-slate-600">Nothing has happened yet.</p>}
        {sorted.map((entry) => (
          <div key={entry.id} className={`text-sm ${TYPE_STYLES[entry.entry_type] ?? 'text-slate-300'}`}>
            {entry.entry_type === 'narration' && <span className="font-semibold">{entry.author_label}: </span>}
            {entry.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
