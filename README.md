# D&D Campaign Manager

A persistent, async-friendly tabletop campaign manager built entirely on a [Base44](https://base44.com) backend, submitted to Base44's **Dev Build-Off** competition. Unlike Discord/Telegram-based play, all game-state logic — dice, combat resolution, turn order, permissions — is enforced server-side, and the world persists between sessions.

- **Live app:** https://dnd-campaign-manager-b1ac1c26.base44.app
- **Backend dashboard:** https://app.base44.com/apps/6a5ffe64a6fdab24b1ac1c26/editor/workspace/overview
- **Ruleset:** lightweight and custom (not full D&D 5e) — simple HP/AC/stats, basic combat — so the effort goes into backend architecture, not rules replication.

---

## What it does

A DM creates a campaign (from scratch, with AI-generated ideas to pick from, or fully AI-generated including starter NPCs and a quest hook), invites players by email, and runs sessions asynchronously — players don't need to be online at the same time. The backend:

- Rolls all dice server-side (cryptographically random, never client-supplied)
- Tracks initiative order and enforces action economy (one action / bonus action / reaction per turn — no client can fake a legal move)
- Resolves attacks, spells, and skill checks deterministically against real character/NPC stats
- Separates what the DM can see from what players can see, at both the row and field level
- Lets an NPC respond in character (via AI) when a player talks to it, with persistent memory of past interactions
- Notifies players when it's their turn

## Architecture

**Backend:** Base44 (Deno/TypeScript serverless functions + MongoDB-compatible entities with row/field-level security)
**Frontend:** React + Vite + Tailwind, deployed as a static SPA to Base44's hosting

### Data model (11 entities)

| Entity | Purpose |
|---|---|
| `Campaign` | The campaign itself — premise, current scene, world state, DM/party roster, per-campaign AI feature toggles |
| `Character` | A player's sheet — HP, AC, stats, conditions, inventory |
| `NPC` | DM-controlled characters/monsters — includes a DM-only `secrets` field and a persistent `memory` of past interactions |
| `Item` | Equipment/loot |
| `Encounter` | Combat state — initiative order, round number, per-participant action-economy flags |
| `Action` | The turn queue / action log — every attack, check, move, or line of dialogue a participant submits |
| `DiceRoll` | Immutable, server-only audit log of every roll made in the game |
| `QuestFlag` | Structured, queryable world-state flags (separate from the freeform `Campaign.world_state` blob) |
| `LogEntry` | The unified party chat + game log feed |
| `DirectMessage` | Private DM ↔ player messaging, invisible to the rest of the party |
| `User` | Base44's built-in auth user, extended with a `username` display-name field |

### Backend functions (13)

| Function | Role |
|---|---|
| `roll-dice` | Ad-hoc server-authoritative rolls (e.g. a DM-called check) |
| `start-encounter` | Rolls initiative for all participants, builds the turn order |
| `submit-action` | Validates it's the actor's turn and the action-economy slot is free, then resolves the action |
| `resolve-action` | Resolves a still-pending action (supports the async, DM-may-be-offline model) |
| `generate-encounter` | AI Gateway code agent — multi-step NPC/item/encounter creation from a scene prompt |
| `generate-full-campaign` | AI Gateway code agent — generates a full campaign premise, starter NPCs, and an opening quest from a one-line theme |
| `generate-campaign-ideas` | Single-call AI brainstorm — a few premise options for the DM to pick from |
| `narrate-outcome` | AI narration of a resolved action; when a player talks to an NPC, generates that NPC's in-character reply and updates its memory |
| `notify-turn` | Announces whose turn it is (log entry + email) |
| `send-chat-message` | Party chat, routed through a function for reliability (see *Notes from building this* below) |
| `add-player` | Adds a player to a campaign after creation, and back-fills their access onto existing records |
| `suggest-action-numbers` | Optional AI assist — suggests reasonable attack/damage/DC numbers |
| `suggest-next-beat` | Optional AI assist — DM pacing/plot nudges grounded in actual campaign state |

### AI — both integration paths, used deliberately

- **Conversational Agent** (`rules_assistant`): a private, per-player chat for "can I do X?" rules questions, grounded via read-only tools into the player's own character sheet and the campaign's current state.
- **AI Gateway code agents** (`generate-encounter`, `generate-full-campaign`): multi-step tool-loop agents that actually create entities (NPCs, items, quest flags) rather than just returning text — this is orchestration, not a single passthrough call.
- **Single-call `InvokeLLM`** (`generate-campaign-ideas`, `narrate-outcome`, `suggest-action-numbers`, `suggest-next-beat`): deterministic, non-agentic generation for cases that don't need tools.

Every AI feature is **optional and DM-controlled** — a per-campaign settings panel lets the DM turn off AI entirely or toggle individual features, enforced both in the UI and server-side in each function.

## Security model

- **Row-level security**: every campaign-scoped entity restricts reads to the DM and seated players only, via denormalized `dm_email`/`party_emails` fields (RLS can't join across entities, so child records carry their own copy of who's allowed to see them).
- **Field-level security**: `NPC.secrets` is readable only by the DM; `Character` fields that matter for fairness (`hp_current`, `hp_max`, `ac`, `conditions`, `level`, `is_alive`) can only be *updated* by the DM or by server-side functions — never edited by the player who owns the sheet.
- **Server-authoritative writes**: `DiceRoll` can only be created by service-role code and can never be updated or deleted — a genuinely tamper-proof audit trail.

## Notes from building this (the interesting part)

A few things worth documenting because they weren't obvious going in and shaped the final design:

1. **Array-field RLS is unreliable at write time.** Comparing `{{user.email}}` against an array field (e.g. `party_emails`) works fine for reads (`list`/`filter`/`get`), but the same pattern silently rejects valid *creates* from non-admin users — confirmed empirically after a long debugging session with a real second test account. The fix: route any write that depends on party membership through a backend function that checks membership in code and writes via `asServiceRole`, rather than trusting client-side entity RLS for that case. `send-chat-message` exists specifically because of this.
2. **Real-time `subscribe()` has the same reliability gap** for non-privileged users, so every live view in the frontend has a jittered polling fallback (with backoff on rate limits) layered on top of `subscribe()`, rather than depending on push delivery alone.
3. **`full_name` doesn't persist via `auth.updateMe()`** on this platform (confirmed empirically — it silently no-ops), so the player-chosen display name is stored as a genuine custom field (`User.username`) instead.
4. **Automations are dashboard-only** — there's no CLI or local-file path to configure them, so `notify-turn` is invoked directly by the frontend after any action that might change whose turn it is, rather than via an entity-triggered automation.
5. **A mock-AI test mode** (`SKIP_AI` secret) was added after burning a meaningful chunk of the shared credit pool on iterative testing — every AI-calling function can short-circuit to canned output, verifying the surrounding logic (auth, membership checks, entity writes) without spending real credits.

## Known limitations

- No inventory/shop UI beyond the `Item` data model existing (items can be created but not yet traded/equipped through the UI).
- The AI Dungeon Master's replies (via `narrate-outcome`) are per-NPC, not a full narrative campaign log — there's no single AI "storyteller" voice narrating every scene transition.
- Player invites are by email; there's no in-app invite link/join flow yet (the DM adds players by email via `add-player`).

## Running it locally

```bash
npm install
npx base44 dev      # starts the Base44 backend + Vite dev server together
```

Requires `npx base44 login` once, and a linked `base44/.app.jsonc` (gitignored — contains the app ID, generated by `base44 create`/`base44 scaffold`).

## Deploying

```bash
npm run build
npx base44 deploy -y   # pushes entities, functions, agent, and the built site together
```
