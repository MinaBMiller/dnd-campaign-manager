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

## How this was built

### Approach

The build order was deliberately backend-first, matching the competition's judging emphasis ("the more creative and the deeper on the backend, the better"): design the full entity model and RLS/FLS rules, build and deploy every backend function, and smoke-test the whole system through the Base44 CLI (`base44 exec`) *before* writing a single line of frontend. Only once combat, dice, chat, and AI generation were verified working server-side did the React frontend get built to consume them.

That ordering paid off, but it also created a blind spot described below.

### Key decisions

- **Custom lightweight ruleset instead of D&D 5e.** Replicating real 5e rules would have burned the whole budget on rules logic instead of backend architecture, so HP/AC/stats/conditions were kept intentionally simple.
- **Denormalize campaign membership onto every child record.** Base44's RLS can't join across entities, so `dm_email`/`party_emails` are copied onto every campaign-scoped entity (`Character`, `NPC`, `Encounter`, `Action`, `DiceRoll`, `QuestFlag`, `LogEntry`) at creation time. This is more redundant than a normalized schema, but it's the only way row-level security can actually express "the DM and this campaign's players, and no one else."
- **Server-authoritative everything that matters for fairness.** Dice, damage, hit/miss, and pass/fail are never trusted from the client — a request just supplies *inputs* (attack bonus, damage formula); the server rolls and decides.
- **Both AI integration paths, used for genuinely different jobs**, not for the checkbox: a conversational Agent for private, in-context rules Q&A; multi-step AI Gateway code agents for actions that need to *create real data* (NPCs, items, quest flags) across several steps, not just return text.
- **AI is opt-in, not load-bearing.** Every AI feature has a per-campaign on/off switch (enforced both in the UI and again server-side in each function), because the app is meant to work for a DM who wants zero AI assistance just as well as one who wants the AI to write the whole campaign.
- **A DM/player view toggle**, added after noticing the DM's own screen was more cluttered with management tools than a player's screen — lets the DM declutter down to what a player sees without actually changing their permissions.

### Challenges and pivots

A few things didn't survive contact with real usage and got redesigned mid-build:

- **The first version of the AI chat was a narrator persona ("talk to the Dungeon Master").** Live testing revealed the name was actively misleading — it read as "message the human DM privately," not "chat with an AI." Rather than just rename it, this became two separate, correctly-scoped features: a real private `DirectMessage` channel between a player and the human DM, and the AI agent was repurposed into a `rules_assistant` that answers "can I do X?" questions grounded in the player's own character sheet — a more clearly-justified use of an AI agent than a generic narrator.
- **Party chat silently failed for real (non-admin) player accounts**, while working fine in every one of my own automated tests. The root cause took a genuine debugging session to isolate: my own test account has an admin role, which happens to independently satisfy the same RLS rule that party membership was supposed to grant — so my "verification" was accidentally testing the wrong code path the whole time. The fix (routing the write through a backend function with an explicit membership check, rather than trusting client-side RLS on an array field) is now the pattern used for every write that depends on party membership.
- **A polling fallback for real-time updates, added after discovering `subscribe()` had the same reliability gap as the RLS issue above, then had to be re-tuned** after the first version (a 3-second poll across every live view on screen) tripped the platform's rate limiter during dual-account testing. The fix was longer, jittered intervals with backoff on failure, not just "poll less."
- **A mock-AI test mode** (`SKIP_AI` secret) got added mid-build after a "used 75% of your integration credits" warning arrived — a direct consequence of how many AI Gateway code-agent calls (each several model calls, not one) had accumulated from iterative testing. Every AI-calling function can now short-circuit to canned output for verifying plumbing without spending real credits.

### What I learned

- **Documentation describes intent, not guaranteed behavior — verify empirically, especially for security rules.** Two separate platform behaviors (array-field RLS at write time, `full_name` not persisting through `auth.updateMe()`) matched the documented API shape exactly while silently not working as documented. Both were only caught by testing with a real, independent, non-privileged account — not by more careful reading of the docs.
- **A test account with elevated privileges can make broken authorization logic look correct.** The party-chat bug above only existed because my own verification never exercised the actual restricted path. Once real dual-account testing (DM + player, genuinely separate logins) started, several latent bugs surfaced within the same session.
- **"Real-time" claims are worth load-testing, not just functionally testing.** `subscribe()` worked in every single-user test; the gap only showed up with a second real account, and the first fix for it (aggressive polling) traded one bug for a different one (rate limiting) — the actual fix needed both a correctness pass and a load pass.
- **Design decisions should stay reversible under user feedback, not just under new requirements.** The AI-narrator-to-rules-assistant pivot wasn't a bug fix — it was scrapping a feature that technically worked because live usage revealed the concept itself was wrong.

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
