import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";
import { skipAi } from "../../shared/mock-ai.ts";

function entityHandlerFor(base44: any, type: "character" | "npc") {
  return type === "character" ? base44.asServiceRole.entities.Character : base44.asServiceRole.entities.NPC;
}

/** Optional assist for players/DMs who don't know what reasonable numbers to type
 * into an attack/spell/skill_check action — manual entry is always the primary path
 * (these fields always come pre-filled with sane defaults); this just offers a more
 * contextual suggestion grounded in the actor's actual level/stats on request. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, actor_id, actor_type, action_kind, target_id, target_type } = await req.json();
    if (!campaign_id || !actor_id || !actor_type || !action_kind) {
      return Response.json({ error: "campaign_id, actor_id, actor_type, and action_kind are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireMembership(membership);
    if (membership.campaign.ai_features?.action_suggestions === false) {
      return Response.json({ error: "The DM has turned off AI action suggestions for this campaign" }, { status: 403 });
    }

    const actor = await entityHandlerFor(base44, actor_type).get(actor_id);
    const target = target_id && target_type ? await entityHandlerFor(base44, target_type).get(target_id) : null;

    if (skipAi()) {
      if (action_kind === "attack" || action_kind === "spell") {
        return Response.json({ attack_bonus: 5, damage_formula: "1d8+3" });
      }
      if (action_kind === "skill_check") {
        return Response.json({ check_bonus: 3, dc: 10 });
      }
      return Response.json({ error: `No suggestion available for action_kind "${action_kind}"` }, { status: 400 });
    }

    if (action_kind === "attack" || action_kind === "spell") {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt:
          "Suggest a reasonable attack_bonus (integer) and damage_formula (dice string like " +
          "'1d8+3') for this character in a lightweight custom-rules tabletop game (not full " +
          "D&D 5e — keep numbers modest and simple, scaled to level).\n\n" +
          `Actor: ${actor?.name}, level ${actor?.level ?? 1}, stats ${JSON.stringify(actor?.stats)}\n` +
          `Action: ${action_kind}\n` +
          `Target AC (for context, don't just guarantee a hit): ${target?.ac ?? "unknown"}`,
        response_json_schema: {
          type: "object",
          properties: {
            attack_bonus: { type: "number" },
            damage_formula: { type: "string" },
          },
        },
      });
      return Response.json(response);
    }

    if (action_kind === "skill_check") {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt:
          "Suggest a reasonable check_bonus (integer) and dc (integer, difficulty class) for " +
          "a skill check in a lightweight custom-rules tabletop game (not full D&D 5e — keep " +
          "numbers modest and simple, scaled to level).\n\n" +
          `Actor: ${actor?.name}, level ${actor?.level ?? 1}, stats ${JSON.stringify(actor?.stats)}`,
        response_json_schema: {
          type: "object",
          properties: {
            check_bonus: { type: "number" },
            dc: { type: "number" },
          },
        },
      });
      return Response.json(response);
    }

    return Response.json({ error: `No suggestion available for action_kind "${action_kind}"` }, { status: 400 });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
