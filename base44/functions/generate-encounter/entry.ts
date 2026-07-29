import { createClientFromRequest } from "npm:@base44/sdk";
import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from "npm:ai@7.0.16";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.5";
import { z } from "npm:zod@4.4.3";
import { loadCampaignMembership, requireDm } from "../../shared/campaign-access.ts";
import { skipAi } from "../../shared/mock-ai.ts";

/** AI Dungeon Master orchestration: DM-only, multi-step encounter generation. A code
 * agent on the AI Gateway reads the campaign's current scene and world state, then
 * uses tools to actually create NPC / Item / Encounter records — this is async,
 * multi-step backend orchestration, not a single passthrough LLM call. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, scene_prompt, difficulty } = await req.json();
    if (!campaign_id || !scene_prompt) {
      return Response.json({ error: "campaign_id and scene_prompt are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireDm(membership);
    if (membership.campaign.ai_features?.encounter_generation === false) {
      return Response.json({ error: "AI encounter generation is turned off for this campaign" }, { status: 403 });
    }

    const questFlags = await base44.asServiceRole.entities.QuestFlag.filter({ campaign_id }, null, 50);

    const createdNpcIds: string[] = [];
    const createdItemIds: string[] = [];
    let finalized: any = null;

    const tools = {
      createNpc: tool({
        description: "Create an NPC (monster or character) participating in this encounter",
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
          secrets: z.string().optional().describe("Hidden DM-only info: true motive, weakness, plot twist"),
        }),
        execute: async (npc: any) => {
          const created = await base44.asServiceRole.entities.NPC.create({
            campaign_id,
            dm_email: membership.campaign.dm_email,
            party_emails: membership.campaign.player_emails ?? [],
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
          createdNpcIds.push(created.id);
          return { id: created.id, name: created.name };
        },
      }),
      createItem: tool({
        description: "Create a loot item available in this encounter",
        inputSchema: z.object({
          name: z.string(),
          description: z.string(),
          item_type: z.enum(["weapon", "armor", "consumable", "treasure", "misc"]),
          effects: z.record(z.string(), z.any()).optional(),
          value_gp: z.number().int().min(0).default(0),
        }),
        execute: async (item: any) => {
          const created = await base44.asServiceRole.entities.Item.create({
            campaign_id,
            dm_email: membership.campaign.dm_email,
            party_emails: membership.campaign.player_emails ?? [],
            name: item.name,
            description: item.description,
            item_type: item.item_type,
            effects: item.effects ?? {},
            quantity: 1,
            value_gp: item.value_gp ?? 0,
          });
          createdItemIds.push(created.id);
          return { id: created.id, name: created.name };
        },
      }),
      finalizeEncounter: tool({
        description: "Call once, when the NPCs (and optional loot) are ready, to create the pending Encounter",
        inputSchema: z.object({ name: z.string(), description: z.string() }),
        execute: async ({ name, description }: any) => {
          const turn_order = createdNpcIds.map((id, i) => ({
            participant_id: id,
            participant_type: "npc" as const,
            label: `npc-${i}`,
            initiative: 0,
            action_used: false,
            bonus_action_used: false,
            reaction_used: false,
          }));
          finalized = await base44.asServiceRole.entities.Encounter.create({
            campaign_id,
            dm_email: membership.campaign.dm_email,
            party_emails: membership.campaign.player_emails ?? [],
            name,
            status: "pending",
            round_number: 1,
            current_turn_index: 0,
            turn_order,
            log_summary: description,
          });
          await base44.asServiceRole.entities.LogEntry.create({
            campaign_id,
            dm_email: membership.campaign.dm_email,
            party_emails: membership.campaign.player_emails ?? [],
            entry_type: "narration",
            author_label: "AI Dungeon Master",
            content: `${name}: ${description}`,
          });
          return { encounter_id: finalized.id };
        },
      }),
    };

    if (skipAi()) {
      // Exercises the same entity-write logic as the real tool calls, with none of
      // the actual (credit-metered) model calls — for verifying plumbing only.
      await (tools.createNpc.execute as any)({
        name: "[MOCK] Test Goblin",
        description: "A stand-in NPC for a real AI-generated one.",
        disposition: "hostile",
        hp_max: 10,
        ac: 12,
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      });
      await (tools.finalizeEncounter.execute as any)({
        name: "[MOCK] Test Encounter",
        description: "A stand-in encounter for a real AI-generated one.",
      });
      return Response.json({
        encounter_id: finalized?.id ?? null,
        npc_ids: createdNpcIds,
        item_ids: createdItemIds,
      });
    }

    const { baseURL, token } = base44.aiGateway.connection();
    const base44Models = createOpenAICompatible({ name: "base44", baseURL, apiKey: token });

    const agent = new ToolLoopAgent({
      model: base44Models("automatic"),
      instructions:
        "You are an assistant Dungeon Master building an encounter for a lightweight, " +
        "custom-rules tabletop campaign (not full D&D 5e — keep stats simple: str/dex/" +
        "con/int/wis/cha around 8-16, hp_max 5-40, ac 10-18). Given the current scene, " +
        "world state, and a target difficulty, create 1-4 NPCs (monsters or characters) " +
        "with createNpc, optionally 0-3 pieces of loot with createItem, then call " +
        "finalizeEncounter exactly once with a name and description tying it together. " +
        "Keep names and descriptions evocative but concise.",
      tools,
      stopWhen: [stepCountIs(10), hasToolCall("finalizeEncounter")],
    });

    await agent.generate({
      prompt:
        `Scene: ${scene_prompt}\n` +
        `Target difficulty: ${difficulty ?? "medium"}\n` +
        `Current campaign scene: ${membership.campaign.current_scene ?? "none set"}\n` +
        `World state: ${JSON.stringify(membership.campaign.world_state ?? {})}\n` +
        `Known quest flags: ${JSON.stringify(questFlags.map((f: any) => ({ key: f.flag_key, value: f.flag_value })))}`,
    });

    return Response.json({
      encounter_id: finalized?.id ?? null,
      npc_ids: createdNpcIds,
      item_ids: createdItemIds,
    });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
