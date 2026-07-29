import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { base44 } from '../base44Client'
import { useAuth } from '../AuthContext.jsx'
import { useLiveList } from '../hooks/useLiveList'
import { isDm } from '../utils/campaignStamp'
import { isAiFeatureEnabled } from '../utils/aiFeatures'
import CharacterSheet from '../components/CharacterSheet.jsx'
import LogFeed from '../components/LogFeed.jsx'
import GameLog from '../components/GameLog.jsx'
import EncounterPanel from '../components/EncounterPanel.jsx'
import TurnActionPanel from '../components/TurnActionPanel.jsx'
import DmControls from '../components/DmControls.jsx'
import NpcList from '../components/NpcList.jsx'
import RulesAssistantChat from '../components/RulesAssistantChat.jsx'
import DirectMessagePanel from '../components/DirectMessagePanel.jsx'
import QuestFlags from '../components/QuestFlags.jsx'
import DisplayNameEditor from '../components/DisplayNameEditor.jsx'
import SceneEditor from '../components/SceneEditor.jsx'
import DmNotes from '../components/DmNotes.jsx'

export default function CampaignRoomPage() {
  const { campaignId } = useParams()
  const { user } = useAuth()
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewAsPlayer, setViewAsPlayer] = useState(false)

  const { items: characters } = useLiveList('Character', campaignId)
  const { items: npcs } = useLiveList('NPC', campaignId)
  const { items: encounters } = useLiveList('Encounter', campaignId)
  const { items: logEntries } = useLiveList('LogEntry', campaignId)
  const { items: questFlags } = useLiveList('QuestFlag', campaignId)

  useEffect(() => {
    let cancelled = false
    let timeoutId
    let backoff = 8000

    // Polling fallback alongside subscribe() (with backoff on failure) — see
    // useLiveList.js for why this exists and why it can't just poll aggressively.
    async function load() {
      try {
        const c = await base44.entities.Campaign.get(campaignId)
        if (cancelled) return
        setCampaign(c)
        setLoading(false)
        backoff = 8000
      } catch {
        backoff = Math.min(backoff * 2, 30000)
      } finally {
        // Jitter only the recurring schedule, not the first fetch.
        if (!cancelled) timeoutId = setTimeout(load, backoff + Math.random() * 2000)
      }
    }
    load()

    const unsubscribe = base44.entities.Campaign.subscribe((event) => {
      if (event.id === campaignId && event.type !== 'delete') {
        setCampaign({ ...event.data, id: event.id })
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [campaignId])

  if (loading || !campaign) {
    return <p className="p-8 text-slate-400">Loading campaign…</p>
  }

  const dm = isDm(campaign, user)
  // Declutters the DM's own screen down to what a player sees — doesn't actually
  // change real permissions, just hides DM-only management UI (controls, party HP
  // view, NPC secrets, end-encounter, quest-flag creation).
  const effectiveDm = dm && !viewAsPlayer
  const activeEncounter = encounters.find((e) => e.status === 'active')

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/campaigns" className="text-xs text-slate-500 hover:underline">
            ← All campaigns
          </Link>
          <h1 className="text-xl font-bold text-amber-400">{campaign.name}</h1>
          <p className="text-sm text-slate-400">{campaign.current_scene || campaign.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-amber-400">{dm ? 'DM' : 'Player'}</span>
          {dm && (
            <button
              onClick={() => setViewAsPlayer((v) => !v)}
              className="text-xs text-slate-500 hover:underline"
            >
              {viewAsPlayer ? 'Switch to DM view' : 'Switch to player view'}
            </button>
          )}
          <DisplayNameEditor />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
        <aside className="space-y-4">
          <CharacterSheet campaign={campaign} user={user} characters={characters} viewAsPlayer={viewAsPlayer} />
          <NpcList campaign={campaign} user={user} npcs={npcs} viewAsPlayer={viewAsPlayer} />
        </aside>

        <main className="flex flex-col gap-4">
          {effectiveDm && <SceneEditor campaign={campaign} />}
          {activeEncounter && (
            <TurnActionPanel
              campaign={campaign}
              user={user}
              encounter={activeEncounter}
              characters={characters}
              npcs={npcs}
            />
          )}
          <GameLog entries={logEntries} />
        </main>

        <aside className="space-y-4">
          {!effectiveDm && (
            <>
              <LogFeed campaign={campaign} user={user} entries={logEntries} />
              {isAiFeatureEnabled(campaign, 'rules_assistant') && (
                <RulesAssistantChat campaign={campaign} user={user} />
              )}
            </>
          )}
          <DirectMessagePanel campaign={campaign} user={user} />
          {activeEncounter && (
            <EncounterPanel campaign={campaign} user={user} encounter={activeEncounter} viewAsPlayer={viewAsPlayer} />
          )}
          {effectiveDm && (
            <>
              <DmControls
                campaign={campaign}
                characters={characters}
                npcs={npcs}
                hasActiveEncounter={!!activeEncounter}
              />
              <DmNotes campaign={campaign} />
            </>
          )}
          <QuestFlags campaign={campaign} user={user} flags={questFlags} viewAsPlayer={viewAsPlayer} />
        </aside>
      </div>
    </div>
  )
}
