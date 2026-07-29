import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { base44 } from '../base44Client'
import { useAuth } from '../AuthContext.jsx'
import AiFeatureToggles from '../components/AiFeatureToggles.jsx'

function ManualCreateForm({ user, navigate, initialName = '', initialDescription = '' }) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [playerEmails, setPlayerEmails] = useState('')
  const [aiFeatures, setAiFeatures] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const player_emails = playerEmails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const campaign = await base44.entities.Campaign.create({
        name,
        description,
        dm_email: user.email,
        player_emails,
        status: 'active',
        ai_features: aiFeatures,
      })
      navigate(`/campaigns/${campaign.id}`)
    } catch (err) {
      setError(err?.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Campaign name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Description / premise</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Player emails (comma-separated — optional, you can add players later too)
        </label>
        <input
          value={playerEmails}
          onChange={(e) => setPlayerEmails(e.target.value)}
          placeholder="alice@example.com, bob@example.com"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <AiFeatureToggles value={aiFeatures} onChange={setAiFeatures} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create campaign (you become DM)'}
      </button>
    </form>
  )
}

function IdeasForm({ user, navigate }) {
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ideas, setIdeas] = useState(null)
  const [chosen, setChosen] = useState(null)

  async function handleGetIdeas(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setIdeas(null)
    try {
      const res = await base44.functions.invoke('generate-campaign-ideas', { theme_prompt: theme })
      setIdeas(res.data.ideas || [])
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
    } finally {
      setBusy(false)
    }
  }

  if (chosen) {
    return (
      <ManualCreateForm
        user={user}
        navigate={navigate}
        initialName={chosen.name}
        initialDescription={chosen.description}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <form onSubmit={handleGetIdeas} className="space-y-2">
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Theme or preference (optional — leave blank to be surprised)
        </label>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. pirates, haunted forest, political intrigue…"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
        >
          {busy ? 'Thinking…' : 'Get ideas'}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {ideas && (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <button
              key={idea.name}
              onClick={() => setChosen(idea)}
              className="block w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-left hover:border-amber-500"
            >
              <p className="text-sm font-semibold text-amber-400">{idea.name}</p>
              <p className="text-xs text-slate-400">{idea.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AiFullForm({ navigate }) {
  const [theme, setTheme] = useState('')
  const [playerEmails, setPlayerEmails] = useState('')
  const [aiFeatures, setAiFeatures] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate(e) {
    e.preventDefault()
    if (!theme.trim()) return
    setBusy(true)
    setError('')
    try {
      const player_emails = playerEmails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await base44.functions.invoke('generate-full-campaign', {
        theme_prompt: theme,
        player_emails,
        ai_features: aiFeatures,
      })
      navigate(`/campaigns/${res.data.campaign_id}`)
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleGenerate} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Theme or preference</label>
        <textarea
          required
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          rows={2}
          placeholder="e.g. a heist against a corrupt merchant guild in a rain-soaked city"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Player emails (comma-separated — optional, you can add players later too)
        </label>
        <input
          value={playerEmails}
          onChange={(e) => setPlayerEmails(e.target.value)}
          placeholder="alice@example.com, bob@example.com"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </div>
      <AiFeatureToggles value={aiFeatures} onChange={setAiFeatures} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Generating campaign (may take ~15-20s)…' : 'Generate full campaign'}
      </button>
    </form>
  )
}

export default function CampaignsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(null) // null | 'ai-full' | 'ai-ideas' | 'manual'

  useEffect(() => {
    base44.entities.Campaign.list('-created_date').then((data) => {
      setCampaigns(data)
      setLoading(false)
    })
  }, [])

  const MODES = [
    { key: 'ai-full', label: 'Let AI create the full campaign', desc: 'Give it a theme, it writes the premise, seeds NPCs and a starting quest.' },
    { key: 'ai-ideas', label: 'Get ideas from AI', desc: "Get a few premise suggestions, then build it yourself from one you like." },
    { key: 'manual', label: 'Start from scratch', desc: 'Write the whole thing yourself.' },
  ]

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-400">Your Campaigns</h1>
          <p className="text-sm text-slate-400">{user?.email}</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-400 hover:text-slate-200">
          Sign out
        </button>
      </header>

      {mode === null ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-left hover:border-amber-500"
            >
              <p className="text-sm font-semibold text-amber-400">{m.label}</p>
              <p className="mt-1 text-xs text-slate-400">{m.desc}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-8">
          <button onClick={() => setMode(null)} className="mb-3 text-xs text-slate-500 hover:underline">
            ← Choose a different way to start
          </button>
          {mode === 'ai-full' && <AiFullForm navigate={navigate} />}
          {mode === 'ai-ideas' && <IdeasForm user={user} navigate={navigate} />}
          {mode === 'manual' && <ManualCreateForm user={user} navigate={navigate} />}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-slate-400">No campaigns yet. Create one above.</p>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/campaigns/${c.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-4 text-left hover:border-amber-500"
              >
                <div>
                  <p className="font-semibold text-slate-100">{c.name}</p>
                  <p className="text-sm text-slate-400">{c.description}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-amber-400">
                  {c.dm_email === user.email ? 'DM' : 'Player'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
