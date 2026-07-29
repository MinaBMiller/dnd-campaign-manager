import { AI_FEATURE_DEFS } from '../utils/aiFeatures'

/** Controlled checkbox group for per-campaign AI feature settings. `value` is an
 * { [featureKey]: boolean } object (missing keys treated as true); `onChange`
 * receives the updated object. */
export default function AiFeatureToggles({ value, onChange }) {
  const allOn = AI_FEATURE_DEFS.every((f) => value[f.key] !== false)

  function setAll(enabled) {
    const next = {}
    for (const f of AI_FEATURE_DEFS) next[f.key] = enabled
    onChange(next)
  }

  function toggle(key) {
    onChange({ ...value, [key]: value[key] === false ? true : false })
  }

  return (
    <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
      <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <input type="checkbox" checked={allOn} onChange={(e) => setAll(e.target.checked)} />
        Use AI features in this campaign
      </label>
      <div className="ml-1 space-y-1.5 border-l border-slate-800 pl-3">
        {AI_FEATURE_DEFS.map((f) => (
          <label key={f.key} className="flex items-start gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={value[f.key] !== false}
              onChange={() => toggle(f.key)}
              className="mt-0.5"
            />
            <span>
              <span className="text-slate-300">{f.label}</span> — {f.description}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
