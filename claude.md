# Project: D&D Campaign Manager (Backend Build-Off Entry)

## Competition Context
- Entry for Base44's "Dev Build-Off" — a backend-focused build competition
- Requirement: must run on a Base44 backend, with our own custom frontend
- Judging emphasis: creativity + backend depth (stated explicitly: "the more creative
  and the deeper on the backend, the better")
- Format decision: standalone responsive web app (not a bot, not mobile, not desktop)
  — chosen to avoid distribution friction and keep 100% of effort on backend logic

## Concept
A persistent, async-friendly D&D-style campaign manager. Players and a DM (optionally
AI-powered) run an ongoing campaign through the app. Unlike Discord/Telegram-based
play, all game-state logic is enforced server-side, and the world persists between
sessions.

Ruleset: lightweight custom rules (not full D&D 5e) — simple HP, a handful of stats,
basic combat — so build time goes into backend architecture, not rules replication.

## Core Backend Systems (this is what's being judged)

1. **Turn/Initiative Engine**
   - Tracks combat order, action economy (action / bonus action / reaction used)
   - Server-side validation of legal moves — no client-side trust

2. **Character & Rules Engine**
   - HP, conditions (poisoned, stunned, etc.), inventory, spell slots
   - Derived stats computed server-side (e.g., AC changes when armor equipped)

3. **AI Dungeon Master Orchestration**
   - Backend coordinates an LLM to generate encounters, NPC dialogue, and narrate
     outcomes based on dice rolls + current party/world state
   - This is async, multi-step orchestration — not a single passthrough API call

4. **Async Multiplayer / Turn Queue**
   - Players don't need to be online simultaneously
   - Backend queues actions, resolves in order, notifies players when it's their turn
   - Event-driven design

5. **Persistent World State**
   - NPCs remember past interactions, quest flags persist, loot/economy tracked
     across sessions

6. **Server-Side Dice Rolling & Validation**
   - All rolls, modifiers, advantage/disadvantage, crits resolved server-side to
     prevent tampering

## Frontend (kept intentionally simple)
- Character sheet view
- Party chat / campaign log feed
- "Take your turn" action panel
- Real-time or near-real-time updates (websockets or polling) so party members see
  actions happen live — this is what makes it "feel alive" without needing a bot or
  native app

## Hosting / Infra Notes
- Backend: hosted via Base44 (competition requirement)
- Frontend: deploy to a free-tier host (Vercel / Netlify / Cloudflare Pages) —
  fine for hackathon-scale demo traffic
- Watch AI usage costs if LLM calls are billed separately from Base44's included usage

## Base44 Backend Platform (confirmed from docs.base44.com, 2026-07-21)
- **Runtime**: Deno/TypeScript serverless functions in `base44/functions/`. Real code,
  not a low-code builder. Max 50 functions/app, 5-min execution cap per call.
- **Database**: MongoDB-compatible NoSQL. Entities defined as JSON Schema files in
  `base44/entities/`. Full CRUD + bulk ops via SDK (`base44.entities.EntityName.*`).
  `list()`/`filter()` capped at 5,000 items/request.
- **Security**: Row-level security (RLS) and field-level security (FLS) per entity,
  condition syntax supports `{{user.id}}`/`{{user.role}}` templating and Mongo-style
  `$or`/`$and`/`$in` logic. Use this for player-vs-DM permission separation (e.g. only
  the DM can write NPC secrets; only the acting player can submit their own action).
- **Real-time**: entities support native `subscribe(callback)` — push events
  (create/update/delete) straight to the frontend. **Resolves the real-time TODO —
  no custom websocket/polling infra needed, use built-in entity subscriptions.**
- **Automations**: cron-scheduled or entity-event-triggered (fires on single-record
  create/update/delete, not bulk ops) backend function invocations. Good fit for the
  turn queue and "notify player it's their turn" flow.
- **AI — two integration paths, worth using both**:
  - *Agents* (`base44/agents/*.jsonc`): declarative config, entity tools + function
    tools, model choice limited to `claude-sonnet-4-20250514` / `claude-3-5-sonnet` /
    `gpt-4o` / `gpt-4o-mini`. Good for a conversational DM persona.
  - *AI Gateway* (`base44.aiGateway.connection()` inside a backend function): any
    OpenAI-compatible SDK, more model flexibility, no streaming, credit-metered. Good
    for deterministic generation steps (e.g. structured encounter JSON output).
- **Auth**: built-in User entity (extendable), SSO/social/password login options.
- **Deploy**: CLI-driven (`npx base44 create` scaffolds, `base44 deploy` ships).

## Competition Process
1. Enroll (name + email)
2. Build: `npx base44 create`, then any custom frontend on top
3. Submit: answer questions, **check off which backend features were used**, feedback
   form
4. Judged — winner gets $10,000 + a feature from the Base44 founder

**Note the checkbox step in submission** — it strongly suggests judging rewards
breadth of distinct backend feature usage, not just a clean minimal path. Bias the
architecture toward touching more of the platform's surface (RLS+FLS, automations,
realtime subscriptions, both AI integration paths, functions) where each addition is
still justified by the design — not padding for its own sake.

## Open Decisions / TODO
- [x] Confirm what Base44's backend actually exposes — see above
- [x] Define data model: 10 entities in `base44/entities/` — Campaign, Character, NPC,
      Item, Encounter, Action, DiceRoll, QuestFlag, LogEntry, plus a placeholder User
      schema (no custom fields; keeps `entities push` from flagging the built-in User
      entity as deleted on every sync). RLS/FLS applied throughout: DM vs party read
      access via denormalized `dm_email`/`party_emails` on every campaign-scoped
      entity (cross-entity RLS joins aren't supported, so child records carry their
      own copy); NPC.secrets is DM-only via FLS; Character.hp_current/hp_max/ac/
      conditions/level/is_alive are locked to DM-or-service-role writes only, so a
      player can't self-edit their own HP/AC; DiceRoll is service-role-create-only
      and immutable (update/delete both `false`) — a provably server-authoritative
      audit log.
- [x] Define API endpoints / which logic lives in which backend function — 6 functions
      in `base44/functions/`: `roll-dice` (ad-hoc server rolls), `start-encounter`
      (initiative + turn order), `submit-action` (validates it's the actor's turn and
      the action-economy slot is free server-side, then resolves it), `resolve-action`
      (DM/automation path for a still-pending action — supports the async "players
      don't need to be online simultaneously" model), `generate-encounter` (AI Gateway
      tool-loop agent — multi-step NPC/item/encounter creation), `narrate-outcome`
      (single InvokeLLM call that also writes to NPC.memory). Shared logic lives in
      `base44/shared/` (`dice.ts`, `resolve-action.ts`, `campaign-access.ts`).
- [x] Real-time mechanism — using Base44's built-in entity `subscribe()`, not custom
      websockets/polling
- [x] Scope AI DM feature — both integration paths used: `dungeon_master` is a
      conversational Agent (`base44/agents/dungeon_master.jsonc`) with read-only
      entity tools for Campaign/NPC/QuestFlag/LogEntry, for in-character chat and
      lore Q&A between mechanical actions. IMPORTANT for the frontend: the agent
      is not told which campaign a conversation belongs to automatically — the
      first user message must state the campaign id/name (e.g. "Campaign: <id> -
      <name>. ..."), confirmed working end-to-end (it correctly used its tools and
      withheld an NPC's DM-only secret). `generate-encounter` is the code-agent path
      on the AI Gateway (`base44.aiGateway.connection()` + a Vercel AI SDK
      `ToolLoopAgent`) for structured, multi-step encounter generation triggered by
      the DM, not a chat.
- [x] End-to-end smoke-tested via `npx base44 exec` (campaign → character/NPC →
      roll-dice → start-encounter → submit-action, including an out-of-turn action
      correctly rejected server-side → narrate-outcome → generate-encounter →
      dungeon_master agent chat), then cleaned up. All 10 entities, 6 functions, and
      the 1 agent are deployed and in sync (`npx base44 deploy -y`).
- [ ] Build the actual frontend (character sheet, party chat/log feed, turn action
      panel, real-time subscriptions) — backend is functionally complete but nothing
      is built to consume it yet.
- [x] `notify-turn` function built and smoke-tested (`base44/functions/notify-turn/`):
      announces the current turn via a `system` LogEntry and emails the owning player
      (`integrations.Core.SendEmail`) if the current participant is a Character.
      Idempotent via `Encounter.last_notified_turn_index`/`last_notified_round`, so
      calling it more than once for the same turn is harmless.
      **Decided against wiring this to a dashboard Automation** — confirmed
      Automations are dashboard-only (no `base44/automations/` convention, no CLI
      subcommand, `functions list` only shows a read-only automation count) and, when
      actually tried in the dashboard, the Workflows builder's trigger UI silently
      queues an AI-chat prompt with no reachable chat panel to send it from (tried
      multiple entry points; message/daily credits weren't the blocker). Instead:
      **the frontend must call `notify-turn` directly** (`{ encounter_id }`) right
      after any action that may have advanced the turn — e.g. right after
      `submit-action` resolves. `notify-turn` now always requires an authenticated
      campaign member (no more "might be called with no session" fallback, since a
      dashboard Automation is no longer the caller).