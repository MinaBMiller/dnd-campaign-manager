import { isDm } from '../utils/campaignStamp'

export default function NpcList({ campaign, user, npcs, viewAsPlayer = false }) {
  const dm = isDm(campaign, user) && !viewAsPlayer
  const alive = npcs.filter((n) => n.is_alive)
  if (alive.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">NPCs</p>
      <div className="space-y-2">
        {alive.map((n) => (
          <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-100">{n.name}</span>
              <span
                className={
                  n.disposition === 'hostile'
                    ? 'text-xs text-red-400'
                    : n.disposition === 'friendly'
                      ? 'text-xs text-green-400'
                      : 'text-xs text-slate-400'
                }
              >
                {n.disposition}
              </span>
            </div>
            <p className="text-xs text-slate-500">{n.description}</p>
            <p className="mt-1 text-xs text-slate-400">
              HP {n.hp_current}/{n.hp_max} · AC {n.ac}
            </p>
            {dm && n.secrets && <p className="mt-1 text-xs text-purple-400">DM only: {n.secrets}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
