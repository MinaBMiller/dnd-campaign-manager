import { createClientFromRequest } from "npm:@base44/sdk";
import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from "npm:ai@7.0.16";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.5";
import { z } from "npm:zod@4.4.3";
import { skipAi } from "../../shared/mock-ai.ts";

/** "Let AI create the full campaign" path: a multi-step code agent that writes the
 * campaign premise, seeds a couple of starter NPCs and quest flags, and sets the
 * opening scene — turning a one-line theme into a ready-to-play campaign. The caller
 * becomes the DM of the new campaign.
 *
 * A draft Campaign is created up front (outside the tool loop) so the agent's NPC/
 * QuestFlag tools have a real campaign_id to attach to from the start; the
 * finalizeCampaign tool then fills in the generated premise/scene/world_state. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { theme_prompt, player_emails, ai_features } = await req.json();
    if (!theme_prompt?.trim()) {
      return Response.json({ error: "theme_prompt is required" }, { status: 400 });
    }

    const draft = await base44.asServiceRole.entities.Campaign.create({
      name: "Generating…",
      dm_email: user.email,
      player_emails: Array.isArray(player_emails) ? player_emails : [],
      status: "setup",
      ai_features: ai_features && typeof ai_features === "object" ? ai_features : {},
    });
    const campaign_id = draft.id;

    let finalized = false;

    const tools = {
      createNpc: tool({
        description: "Create a starter NPC for this new campaign",
        inputSchema: z.object({
          name: z.string(),
          description: z.string(),
          disposition: z.enum(["friendly", "neutral", "hostile"]),
          hp_max: z.number().int().min(1).max(200),
          ac: z.number().int().min(5).max(25),
          stats: z.object({
            str: z.number().int(), dex: z.number().int(), con: z.number().int(),
            int: z.number().int(), wis: z.number().int(), cha: z.number().int(),
          }),
          secrets: z.string().optional().describe("Hidden DM-only info: true motive, secret, plot twist"),
        }),
        execute: async (npc: any) => {
          const created = await base44.asServiceRole.entities.NPC.create({
            campaign_id,
            dm_email: user.email,
            party_emails: Array.isArray(player_emails) ? player_emails : [],
            name: npc.name,
            description: npc.description,
            disposition: npc.disposition,
            stats: npc.stats,
            hp_current: npc.hp_max,
            hp_max: npc.hp_max,
            ac: npc.ac,
            is_alive: true,
            memory: [],
            secrets: npc.secrets ?? "",
          });
          return { id: created.id, name: created.name };
        },
      }),
      createQuestFlag: tool({
        description: "Create a starting quest flag representing the party's opening hook/goal",
        inputSchema: z.object({
          flag_key: z.string(),
          description: z.string(),
        }),
        execute: async ({ flag_key, description }: any) => {
          const created = await base44.asServiceRole.entities.QuestFlag.create({
            campaign_id,
            dm_email: user.email,
            party_emails: Array.isArray(player_emails) ? player_emails : [],
            flag_key,
            flag_value: "false",
            flag_type: "boolean",
            description,
          });
          return { id: created.id, flag_key: created.flag_key };
        },
      }),
      finalizeCampaign: tool({
        description: "Call once, last, to set the campaign's premise/scene/world_state and make it active",
        inputSchema: z.object({
          name: z.string(),
          description: z.string(),
          current_scene: z.string(),
          world_state: z.record(z.string(), z.any()).optional(),
        }),
        execute: async ({ name, description, current_scene, world_state }: any) => {
          await base44.asServiceRole.entities.Campaign.update(campaign_id, {
            name,
            description,
            current_scene,
            world_state: world_state ?? {},
            status: "active",
          });
          await base44.asServiceRole.entities.LogEntry.create({
            campaign_id,
            dm_email: user.email,
            party_emails: Array.isArray(player_emails) ? player_emails : [],
            entry_type: "narration",
            author_label: "AI Dungeon Master",
            content: current_scene,
          });
          finalized = true;
          return { ok: true };
        },
      }),
    };

    if (skipAi()) {
      // Exercises the same entity-write logic as the real tool calls, with none of
      // the actual (credit-metered) model calls — for verifying plumbing only.
      await (tools.createNpc.execute as any)({
        name: "[MOCK] Test Ally",
        description: "A stand-in NPC for a real AI-generated one.",
        disposition: "friendly",
        hp_max: 10,
        ac: 12,
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      });
      await (tools.createQuestFlag.execute as any)({
        flag_key: "mock_opening_hook",
        description: "A stand-in quest flag for a real AI-generated one.",
      });
      await (tools.finalizeCampaign.execute as any)({
        name: `[MOCK] ${theme_prompt.slice(0, 40)}`,
        description: "A stand-in campaign premise for a real AI-generated one.",
        current_scene: "A stand-in opening scene for a real AI-generated one.",
        world_state: {},
      });
      return Response.json({ campaign_id });
    }

    const { baseURL, token } = base44.aiGateway.connection();
    const base44Models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token });

    const agent = new ToolLoopAgent({
      model: base44Models("automatic"),
      instructions:
        "You are building a brand-new campaign for a lightweight, custom-rules tabletop " +
        "game (explicitly NOT full D&D 5e — simple HP/AC/stats around 8-18, basic combat, " +
        "so build a strong premise and hooks rather than rules complexity). Given the DM's " +
        "theme/preference, do the following in order:\n" +
        "1. Create 2-3 starter NPCs with createNpc (a mix of allies, rivals, or quest-givers " +
        "fitting the premise).\n" +
        "2. Create 1-2 starter QuestFlags with createQuestFlag representing the opening " +
        "hook/goal the party starts with (flag_type 'boolean', not yet completed).\n" +
        "3. Call finalizeCampaign exactly once, last, with the campaign's name, a punchy " +
        "one-paragraph description/premise, the opening scene (where the party is right " +
        "now and what's immediately happening), and a small world_state object capturing " +
        "any starting faction standing, notable locations, or economy hooks worth tracking.",
      tools,
      stopWhen: [stepCountIs(12), hasToolCall("finalizeCampaign")],
    });

    await agent.generate({ prompt: `Theme/preference from the DM: ${theme_prompt}` });

    if (!finalized) {
      // Safety net: if the agent stopped without calling finalizeCampaign, don't
      // leave a "Generating…" campaign stuck in setup.
      await base44.asServiceRole.entities.Campaign.update(campaign_id, {
        name: theme_prompt.slice(0, 60),
        status: "active",
      });
    }

    return Response.json({ campaign_id });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
