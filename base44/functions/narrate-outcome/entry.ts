import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";
import { skipAi } from "../../shared/mock-ai.ts";

function entityHandlerFor(base44: any, type: "character" | "npc") {
  return type === "character" ? base44.asServiceRole.entities.Character : base44.asServiceRole.entities.NPC;
}

/** Turns a resolved Action's mechanical result (dice + damage numbers) into a short
 * piece of DM-style narration, and gives any NPC involved a persistent memory of the
 * event. A single deterministic InvokeLLM call — no tool loop needed here, unlike
 * generate-encounter. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action_id } = await req.json();
    if (!action_id) return Response.json({ error: "action_id is required" }, { status: 400 });

    const action = await base44.asServiceRole.entities.Action.get(action_id);
    if (!action) return Response.json({ error: "Action not found" }, { status: 404 });
    if (action.status !== "resolved") {
      return Response.json({ error: "Action has not been resolved yet" }, { status: 409 });
    }

    const membership = await loadCampaignMembership(base44, action.campaign_id, user.email);
    requireMembership(membership);

    const actor = await entityHandlerFor(base44, action.actor_type).get(action.actor_id);
    const target = action.target_id && action.target_type ? await entityHandlerFor(base44, action.target_type).get(action.target_id) : null;

    const isDialogueWithNpc = action.action_kind === "dialogue" && action.target_type === "npc" && target;

    if (isDialogueWithNpc && membership.campaign.ai_features?.npc_dialogue === false) {
      return Response.json({ error: "The DM has turned off AI NPC dialogue for this campaign" }, { status: 403 });
    }

    const prompt = isDialogueWithNpc
      ? "You are voicing an NPC in a lightweight tabletop campaign, responding in character " +
        "to something a player just said to them. Reply in first person, 1-3 sentences, in a " +
        "voice matching the NPC's description and disposition. You may draw on the NPC's " +
        "secrets/true motives to color the response (what they're guarded about, what they " +
        "avoid saying) but do not state a secret outright unless it fits the moment. Consider " +
        "past interactions for continuity/callbacks if relevant.\n\n" +
        `NPC: ${target.name}\n` +
        `Description: ${target.description ?? ""}\n` +
        `Disposition toward the party: ${target.disposition}\n` +
        `Secrets (DM-only context, don't reveal outright): ${target.secrets || "none"}\n` +
        `Past interactions: ${JSON.stringify((target.memory ?? []).slice(-3).map((m: any) => m.summary))}\n\n` +
        `${actor?.name ?? "The player"} says: "${action.payload?.line ?? action.result?.line ?? ""}"\n\n` +
        `Reply as ${target.name} now.`
      : "You are a Dungeon Master narrating combat/story outcomes in one or two vivid " +
        "sentences, second person plural ('you'), no meta-commentary about dice.\n\n" +
        `Actor: ${actor?.name ?? action.actor_id}\n` +
        `Action: ${action.action_kind}\n` +
        `Target: ${target?.name ?? "none"}\n` +
        `Mechanical result: ${JSON.stringify(action.result)}\n\n` +
        "Write the narration now.";

    let narration: string;
    if (skipAi()) {
      narration = `[MOCK] A stand-in narration for a real AI-generated one (${action.action_kind}).`;
    } else {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: { narration: { type: "string" } },
        },
      });
      narration = (response as any).narration ?? String(response);
    }

    await base44.asServiceRole.entities.LogEntry.create({
      campaign_id: action.campaign_id,
      dm_email: action.dm_email,
      party_emails: action.party_emails ?? [],
      entry_type: "narration",
      author_label: isDialogueWithNpc ? target.name : "AI Dungeon Master",
      content: narration,
      related_action_id: action.id,
    });

    const memoryEntry = { summary: narration, timestamp: new Date().toISOString() };
    if (action.actor_type === "npc" && actor) {
      await base44.asServiceRole.entities.NPC.update(actor.id, { memory: [...(actor.memory ?? []), memoryEntry] });
    }
    if (action.target_type === "npc" && target) {
      await base44.asServiceRole.entities.NPC.update(target.id, { memory: [...(target.memory ?? []), memoryEntry] });
    }

    return Response.json({ narration });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
