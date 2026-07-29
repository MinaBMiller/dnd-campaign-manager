import { useState } from 'react'
import { base44 } from '../base44Client'
import { isDm } from '../utils/campaignStamp'
import { isAiFeatureEnabled } from '../utils/aiFeatures'

const ACTION_KINDS = [
  { value: 'attack', label: 'Attack' },
  { value: 'spell', label: 'Cast Spell' },
  { value: 'skill_check', label: 'Skill Check' },
  { value: 'move', label: 'Move' },
  { value: 'item_use', label: 'Use Item' },
  { value: 'dialogue', label: 'Say Something' },
  { value: 'end_turn', label: 'End Turn' },
]

const NEEDS_TARGET = new Set(['attack', 'spell'])
const SHOWS_TARGET = new Set(['attack', 'spell', 'dialogue'])

function summarizeResult(actionKind, result) {
  if (result.error) return result.error
  switch (actionKind) {
    case 'attack':
    case 'spell':
      return result.hit
        ? `Hit! ${result.damage_dealt} damage dealt (${result.target_hp_remaining} HP left).`
        : 'Missed.'
    case 'skill_check':
      return result.success ? `Success! (${result.check_roll?.total} vs DC ${result.dc})` : `Failed. (${result.check_roll?.total} vs DC ${result.dc})`
    case 'move':
      return 'Moved.'
    case 'item_use':
      return 'Item used.'
    case 'dialogue':
      return 'Sent.'
    case 'end_turn':
      return 'Turn ended.'
    default:
      return 'Done.'
  }
}

export default function TurnActionPanel({ campaign, user, encounter, characters, npcs }) {
  const [actionKind, setActionKind] = useState('attack')
  const [targetId, setTargetId] = useState('')
  const [attackBonus, setAttackBonus] = useState(5)
  const [damageFormula, setDamageFormula] = useState('1d8+3')
  const [skill, setSkill] = useState('')
  const [checkBonus, setCheckBonus] = useState(3)
  const [dc, setDc] = useState(10)
  const [destination, setDestination] = useState('')
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [suggesting, setSuggesting] = useState(false)

  if (!encounter) return null

  const current = encounter.turn_order?.[encounter.current_turn_index]
  if (!current) return null

  const dm = isDm(campaign, user)
  const actingCharacter =
    current.participant_type === 'character' ? characters.find((c) => c.id === current.participant_id) : null
  const isMyTurn =
    current.participant_type === 'character' ? actingCharacter?.user_email === user.email : dm

  if (!isMyTurn) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Waiting on <span className="font-semibold text-amber-400">{current.label}</span>…
      </div>
    )
  }

  const targets = current.participant_type === 'character' ? npcs.filter((n) => n.is_alive) : characters.filter((c) => c.is_alive)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const payload = {}
      if (actionKind === 'attack' || actionKind === 'spell') {
        payload.attack_bonus = Number(attackBonus)
        payload.damage_formula = damageFormula
      } else if (actionKind === 'skill_check') {
        payload.skill = skill
        payload.check_bonus = Number(checkBonus)
        payload.dc = Number(dc)
      } else if (actionKind === 'move') {
        payload.destination = destination
      } else if (actionKind === 'dialogue') {
        payload.line = line
      }

      const target = SHOWS_TARGET.has(actionKind) && targetId
        ? targets.find((t) => t.id === targetId)
        : null
      const targetType = target ? (current.participant_type === 'character' ? 'npc' : 'character') : null

      const res = await base44.functions.invoke('submit-action', {
        campaign_id: campaign.id,
        encounter_id: encounter.id,
        actor_id: current.participant_id,
        actor_type: current.participant_type,
        action_kind: actionKind,
        target_id: target?.id ?? null,
        target_type: targetType,
        payload,
      })
      setResult({ kind: actionKind, data: res.data.action.result })
      setLine('')
      setDestination('')

      // Fire-and-forget: announce whichever turn is now current (idempotent, so safe
      // to call even if this particular action didn't advance the turn).
      base44.functions.invoke('notify-turn', { encounter_id: encounter.id }).catch(() => {})

      // Talking to an NPC gets an in-character AI response, also fire-and-forget.
      if (actionKind === 'dialogue' && targetType === 'npc' && isAiFeatureEnabled(campaign, 'npc_dialogue')) {
        base44.functions.invoke('narrate-outcome', { action_id: res.data.action.id }).catch(() => {})
      }
    } catch (err) {
      setResult({ kind: actionKind, data: { error: err?.response?.data?.error || err.message } })
    } finally {
      setBusy(false)
    }
  }

  // Optional AI assist — manual entry (with pre-filled defaults) is always the
  // primary path; this just offers a more contextual number on request.
  async function handleSuggest() {
    setSuggesting(true)
    try {
      const target = targetId ? targets.find((t) => t.id === targetId) : null
      const res = await base44.functions.invoke('suggest-action-numbers', {
        campaign_id: campaign.id,
        actor_id: current.participant_id,
        actor_type: current.participant_type,
        action_kind: actionKind,
        target_id: target?.id ?? null,
        target_type: target ? (current.participant_type === 'character' ? 'npc' : 'character') : null,
      })
      if (actionKind === 'attack' || actionKind === 'spell') {
        if (res.data.attack_bonus != null) setAttackBonus(res.data.attack_bonus)
        if (res.data.damage_formula) setDamageFormula(res.data.damage_formula)
      } else if (actionKind === 'skill_check') {
        if (res.data.check_bonus != null) setCheckBonus(res.data.check_bonus)
        if (res.data.dc != null) setDc(res.data.dc)
      }
    } catch {
      // Optional assist — a failure here just means the manual defaults stay as-is.
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-amber-700/50 bg-slate-900 p-4">
      <p className="text-sm font-semibold text-amber-400">
        Your turn — {current.label} (round {encounter.round_number})
      </p>

      <select
        value={actionKind}
        onChange={(e) => setActionKind(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
      >
        {ACTION_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      {SHOWS_TARGET.has(actionKind) && (
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          <option value="">{actionKind === 'dialogue' ? 'Talk to… (optional)' : 'Choose target…'}</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {actionKind !== 'dialogue' && `(${t.hp_current}/${t.hp_max} HP)`}
            </option>
          ))}
        </select>
      )}

      {(actionKind === 'attack' || actionKind === 'spell') && (
        <div className="flex gap-2">
          <input
            type="number"
            value={attackBonus}
            onChange={(e) => setAttackBonus(e.target.value)}
            title="Attack bonus"
            className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <input
            value={damageFormula}
            onChange={(e) => setDamageFormula(e.target.value)}
            title="Damage formula, e.g. 1d8+3"
            className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          {isAiFeatureEnabled(campaign, 'action_suggestions') && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
              title="Not sure what to put? Get an AI suggestion"
              className="shrink-0 rounded bg-slate-800 px-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {suggesting ? '…' : 'Suggest'}
            </button>
          )}
        </div>
      )}

      {actionKind === 'skill_check' && (
        <div className="flex gap-2">
          <input
            placeholder="Skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            className="w-1/4 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <input
            type="number"
            title="Check bonus"
            value={checkBonus}
            onChange={(e) => setCheckBonus(e.target.value)}
            className="w-1/4 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <input
            type="number"
            title="DC"
            value={dc}
            onChange={(e) => setDc(e.target.value)}
            className="w-1/4 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          {isAiFeatureEnabled(campaign, 'action_suggestions') && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
              title="Not sure what to put? Get an AI suggestion"
              className="w-1/4 shrink-0 rounded bg-slate-800 px-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {suggesting ? '…' : 'Suggest'}
            </button>
          )}
        </div>
      )}

      {actionKind === 'move' && (
        <input
          placeholder="Move to…"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
        />
      )}

      {actionKind === 'dialogue' && (
        <input
          placeholder="What do you say?"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
        />
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-amber-500 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Resolving…' : 'Submit action'}
      </button>

      {result && (
        <p className={`rounded p-2 text-xs ${result.data.error ? 'bg-red-950 text-red-400' : 'bg-slate-950 text-slate-300'}`}>
          {summarizeResult(result.kind, result.data)}
        </p>
      )}
    </form>
  )
}
