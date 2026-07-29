export const AI_FEATURE_DEFS = [
  { key: 'encounter_generation', label: 'AI encounter generation', description: "DM tool: \"Generate encounter with AI\"" },
  { key: 'npc_dialogue', label: 'AI NPC dialogue', description: 'AI-voiced NPC replies when a player talks to one' },
  { key: 'rules_assistant', label: 'Rules assistant chat', description: 'Private "Ask about the rules" chat for players' },
  { key: 'action_suggestions', label: 'Action number suggestions', description: '"Suggest" buttons for attack/skill-check numbers' },
  { key: 'next_beat_suggestions', label: '"What should happen next?"', description: 'Optional DM nudge for pacing/plot ideas' },
]

// Missing fields (e.g. campaigns created before this setting existed) default to enabled.
export function isAiFeatureEnabled(campaign, key) {
  return campaign?.ai_features?.[key] !== false
}
