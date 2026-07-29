import { base44 } from '../base44Client'
import { isDm } from '../utils/campaignStamp'

export default function EncounterPanel({ campaign, user, encounter, viewAsPlayer = false }) {
  const dm = isDm(campaign, user) && !viewAsPlayer
  if (!encounter) return null

  async function endEncounter() {
    await base44.entities.Encounter.update(encounter.id, { status: 'resolved' })
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">{encounter.name}</p>
        {dm && (
          <button onClick={endEncounter} className="text-xs text-red-400 hover:underline">
            End encounter
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500">Round {encounter.round_number}</p>
      <ol className="space-y-1">
        {encounter.turn_order?.map((p, i) => (
          <li
            key={p.participant_id}
            className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
              i === encounter.current_turn_index ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'
            }`}
          >
            <span>{p.label}</span>
            <span className="text-xs">init {p.initiative}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
