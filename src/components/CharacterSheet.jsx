import { useState } from 'react'
import { base44 } from '../base44Client'
import { isDm } from '../utils/campaignStamp'

const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

function StatBlock({ stats }) {
  return (
    <div className="grid grid-cols-6 gap-1 text-center text-xs">
      {STAT_KEYS.map((key) => (
        <div key={key} className="rounded bg-slate-800 py-1">
          <div className="text-slate-500 uppercase">{key}</div>
          <div className="font-semibold text-slate-100">{stats?.[key] ?? 10}</div>
        </div>
      ))}
    </div>
  )
}

function HpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full bg-red-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function CreateCharacterForm({ campaign, user, onCreated }) {
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [hpMax, setHpMax] = useState(10)
  const [ac, setAc] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // Fetch fresh rather than trusting the campaign prop — see LogFeed.jsx for why.
      const fresh = await base44.entities.Campaign.get(campaign.id)
      const character = await base44.entities.Character.create({
        campaign_id: campaign.id,
        user_email: user.email,
        dm_email: fresh.dm_email,
        party_emails: fresh.player_emails ?? [],
        name,
        class_name: className,
        level: 1,
        hp_current: Number(hpMax),
        hp_max: Number(hpMax),
        ac: Number(ac),
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        conditions: [],
        is_alive: true,
        initiative_bonus: 0,
      })
      onCreated(character)
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm font-semibold text-slate-200">Create your character</p>
      <input
        required
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
      />
      <input
        placeholder="Class"
        value={className}
        onChange={(e) => setClassName(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          value={hpMax}
          onChange={(e) => setHpMax(e.target.value)}
          className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          title="Max HP"
        />
        <input
          type="number"
          min="1"
          value={ac}
          onChange={(e) => setAc(e.target.value)}
          className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          title="Armor Class"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-amber-500 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create'}
      </button>
    </form>
  )
}

async function adjustHp(character, delta) {
  const next = Math.max(0, Math.min(character.hp_max, character.hp_current + delta))
  await base44.entities.Character.update(character.id, { hp_current: next, is_alive: next > 0 })
}

export default function CharacterSheet({ campaign, user, characters, viewAsPlayer = false }) {
  const own = characters.find((c) => c.user_email === user.email)
  const dm = isDm(campaign, user) && !viewAsPlayer

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Character</h2>

      {!own && !dm && <CreateCharacterForm campaign={campaign} user={user} onCreated={() => {}} />}
      {!own && dm && <p className="text-sm text-slate-500">You haven't created a DM character.</p>}

      {own && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <p className="font-semibold text-slate-100">{own.name}</p>
            <span className="text-xs text-slate-500">
              Lvl {own.level} {own.class_name}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
            <span>
              HP {own.hp_current}/{own.hp_max}
            </span>
            <span>· AC {own.ac}</span>
            {!own.is_alive && <span className="text-red-400">DOWN</span>}
          </div>
          <HpBar current={own.hp_current} max={own.hp_max} />
          <div className="mt-3">
            <StatBlock stats={own.stats} />
          </div>
          {own.conditions?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {own.conditions.map((c) => (
                <span key={c} className="rounded-full bg-purple-900/60 px-2 py-0.5 text-xs text-purple-300">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {dm && characters.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Party (DM view)</p>
          <div className="space-y-2">
            {characters.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-100">{c.name}</p>
                  <span className="text-xs text-slate-500">{c.user_email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <HpBar current={c.hp_current} max={c.hp_max} />
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400">
                    {c.hp_current}/{c.hp_max}
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => adjustHp(c, -1)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
                  >
                    -1 HP
                  </button>
                  <button
                    onClick={() => adjustHp(c, 1)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
                  >
                    +1 HP
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
