import { useState } from 'react'
import { base44 } from '../base44Client'
import { isAiFeatureEnabled } from '../utils/aiFeatures'

export default function DmControls({ campaign, characters, npcs, hasActiveEncounter }) {
  const [selected, setSelected] = useState(new Set())
  const [encounterName, setEncounterName] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const [scenePrompt, setScenePrompt] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)
  const [generateError, setGenerateError] = useState('')

  const [playerEmail, setPlayerEmail] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [addPlayerMessage, setAddPlayerMessage] = useState('')

  const [npcName, setNpcName] = useState('')
  const [npcDescription, setNpcDescription] = useState('')
  const [npcDisposition, setNpcDisposition] = useState('neutral')
  const [npcHpMax, setNpcHpMax] = useState(10)
  const [npcAc, setNpcAc] = useState(10)
  const [addingNpc, setAddingNpc] = useState(false)
  const [addNpcError, setAddNpcError] = useState('')

  const [nextBeatLoading, setNextBeatLoading] = useState(false)
  const [nextBeatSuggestions, setNextBeatSuggestions] = useState(null)
  const [nextBeatError, setNextBeatError] = useState('')

  const alive = { characters: characters.filter((c) => c.is_alive), npcs: npcs.filter((n) => n.is_alive) }

  async function handleAddNpc(e) {
    e.preventDefault()
    if (!npcName.trim()) return
    setAddingNpc(true)
    setAddNpcError('')
    try {
      await base44.entities.NPC.create({
        campaign_id: campaign.id,
        dm_email: campaign.dm_email,
        party_emails: campaign.player_emails ?? [],
        name: npcName.trim(),
        description: npcDescription.trim(),
        disposition: npcDisposition,
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        hp_current: Number(npcHpMax),
        hp_max: Number(npcHpMax),
        ac: Number(npcAc),
        is_alive: true,
        memory: [],
      })
      setNpcName('')
      setNpcDescription('')
      setNpcDisposition('neutral')
      setNpcHpMax(10)
      setNpcAc(10)
    } catch (err) {
      setAddNpcError(err?.response?.data?.message || err.message)
    } finally {
      setAddingNpc(false)
    }
  }

  async function handleNextBeat() {
    setNextBeatLoading(true)
    setNextBeatError('')
    try {
      const res = await base44.functions.invoke('suggest-next-beat', { campaign_id: campaign.id })
      setNextBeatSuggestions(res.data.suggestions)
    } catch (err) {
      setNextBeatError(err?.response?.data?.error || err.message)
    } finally {
      setNextBeatLoading(false)
    }
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAddPlayer(e) {
    e.preventDefault()
    if (!playerEmail.trim()) return
    setAddingPlayer(true)
    setAddPlayerMessage('')
    try {
      const res = await base44.functions.invoke('add-player', {
        campaign_id: campaign.id,
        player_email: playerEmail.trim(),
      })
      setAddPlayerMessage(res.data.already_member ? 'Already a member' : `Added ${res.data.added}`)
      setPlayerEmail('')
    } catch (err) {
      setAddPlayerMessage(err?.response?.data?.error || err.message)
    } finally {
      setAddingPlayer(false)
    }
  }

  async function handleStart(e) {
    e.preventDefault()
    setStarting(true)
    setStartError('')
    try {
      const participants = [
        ...alive.characters
          .filter((c) => selected.has(c.id))
          .map((c) => ({ participant_id: c.id, participant_type: 'character', label: c.name, initiative_bonus: c.initiative_bonus ?? 0 })),
        ...alive.npcs
          .filter((n) => selected.has(n.id))
          .map((n) => ({ participant_id: n.id, participant_type: 'npc', label: n.name, initiative_bonus: 0 })),
      ]
      if (participants.length === 0) return
      await base44.functions.invoke('start-encounter', {
        campaign_id: campaign.id,
        name: encounterName || 'Encounter',
        participants,
      })
      setSelected(new Set())
      setEncounterName('')
    } catch (err) {
      setStartError(err?.response?.data?.error || err.message)
    } finally {
      setStarting(false)
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setGenerating(true)
    setGenerateResult(null)
    setGenerateError('')
    try {
      const res = await base44.functions.invoke('generate-encounter', {
        campaign_id: campaign.id,
        scene_prompt: scenePrompt,
        difficulty,
      })
      setGenerateResult(res.data)
      setScenePrompt('')
    } catch (err) {
      setGenerateError(err?.response?.data?.error || err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-200">Add player</p>
        <form onSubmit={handleAddPlayer} className="flex gap-2">
          <input
            type="email"
            placeholder="player@example.com"
            value={playerEmail}
            onChange={(e) => setPlayerEmail(e.target.value)}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={addingPlayer}
            className="rounded bg-slate-700 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {addPlayerMessage && <p className="mt-1 text-xs text-slate-500">{addPlayerMessage}</p>}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-200">Add NPC</p>
        <form onSubmit={handleAddNpc} className="space-y-2">
          <input
            placeholder="Name"
            value={npcName}
            onChange={(e) => setNpcName(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <input
            placeholder="Description (optional)"
            value={npcDescription}
            onChange={(e) => setNpcDescription(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={npcDisposition}
              onChange={(e) => setNpcDisposition(e.target.value)}
              className="w-1/3 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            >
              <option value="friendly">Friendly</option>
              <option value="neutral">Neutral</option>
              <option value="hostile">Hostile</option>
            </select>
            <input
              type="number"
              title="Max HP"
              value={npcHpMax}
              onChange={(e) => setNpcHpMax(e.target.value)}
              className="w-1/3 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
            <input
              type="number"
              title="Armor Class"
              value={npcAc}
              onChange={(e) => setNpcAc(e.target.value)}
              className="w-1/3 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={addingNpc}
            className="w-full rounded bg-slate-700 py-1.5 text-sm font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            {addingNpc ? 'Adding…' : 'Add NPC'}
          </button>
        </form>
        {addNpcError && <p className="mt-2 text-xs text-red-400">{addNpcError}</p>}
      </div>

      {isAiFeatureEnabled(campaign, 'next_beat_suggestions') && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">What should happen next?</p>
            <button
              onClick={handleNextBeat}
              disabled={nextBeatLoading}
              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            >
              {nextBeatLoading ? 'Thinking…' : 'Ask AI'}
            </button>
          </div>
          <p className="text-xs text-slate-500">Optional nudge — not required, ignore it if you already know.</p>
          {nextBeatError && <p className="mt-2 text-xs text-red-400">{nextBeatError}</p>}
          {nextBeatSuggestions && (
            <ul className="mt-2 space-y-1">
              {nextBeatSuggestions.map((s, i) => (
                <li key={i} className="rounded bg-slate-950 p-2 text-xs text-slate-300">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isAiFeatureEnabled(campaign, 'encounter_generation') && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-200">Generate encounter with AI</p>
          <form onSubmit={handleGenerate} className="space-y-2">
            <textarea
              required
              placeholder="Describe the scene… e.g. 'a smugglers' den beneath the docks'"
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button
              type="submit"
              disabled={generating}
              className="w-full rounded bg-slate-700 py-1.5 text-sm font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            >
              {generating ? 'Generating (may take ~10s)…' : 'Generate NPCs + encounter'}
            </button>
          </form>
          {generateError && <p className="mt-2 text-xs text-red-400">{generateError}</p>}
          {generateResult && (
            <p className="mt-2 text-xs text-slate-500">
              Created {generateResult.npc_ids?.length ?? 0} NPC(s) and {generateResult.item_ids?.length ?? 0} item(s).
              Select them below to start combat.
            </p>
          )}
        </div>
      )}

      {!hasActiveEncounter && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-200">Start encounter</p>
          <form onSubmit={handleStart} className="space-y-2">
            <input
              placeholder="Encounter name"
              value={encounterName}
              onChange={(e) => setEncounterName(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {alive.characters.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  {c.name} (PC)
                </label>
              ))}
              {alive.npcs.map((n) => (
                <label key={n.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
                  {n.name} (NPC)
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={starting || selected.size === 0}
              className="w-full rounded bg-amber-500 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {starting ? 'Rolling initiative…' : 'Roll initiative & start'}
            </button>
            {startError && <p className="text-xs text-red-400">{startError}</p>}
          </form>
        </div>
      )}
    </div>
  )
}
