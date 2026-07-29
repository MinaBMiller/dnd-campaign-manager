import { createClientFromRequest } from "npm:@base44/sdk";
import { rollDice } from "../../shared/dice.ts";
import { loadCampaignMembership, requireDm } from "../../shared/campaign-access.ts";

interface ParticipantInput {
  participant_id: string;
  participant_type: "character" | "npc";
  label: string;
  initiative_bonus?: number;
}

/** DM-only: rolls initiative for every participant, builds the turn order, and
 * creates an active Encounter. This is the entry point into the turn/initiative
 * engine — all subsequent turns are validated and resolved by submit-action. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, name, participants } = await req.json();
    if (!campaign_id || !Array.isArray(participants) || participants.length === 0) {
      return Response.json({ error: "campaign_id and a non-empty participants array are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireDm(membership);

    const rolled = [];
    for (const p of participants as ParticipantInput[]) {
      const initiativeRoll = rollDice({ count: 1, sides: 20, modifier: p.initiative_bonus ?? 0 });
      await base44.asServiceRole.entities.DiceRoll.create({
        campaign_id,
        dm_email: membership.campaign.dm_email,
        party_emails: membership.campaign.player_emails ?? [],
        actor_id: p.participant_id,
        actor_label: p.label,
        roll_purpose: "initiative",
        formula: `1d20+${p.initiative_bonus ?? 0}`,
        mode: "normal",
        dice_results: initiativeRoll.dice_results,
        modifier: initiativeRoll.modifier,
        total: initiativeRoll.total,
        is_critical: initiativeRoll.is_critical,
        is_fumble: initiativeRoll.is_fumble,
      });
      rolled.push({
        participant_id: p.participant_id,
        participant_type: p.participant_type,
        label: p.label,
        initiative: initiativeRoll.total,
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
      });
    }

    rolled.sort((a, b) => b.initiative - a.initiative);

    const encounter = await base44.asServiceRole.entities.Encounter.create({
      campaign_id,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      name: name ?? "Encounter",
      status: "active",
      round_number: 1,
      current_turn_index: 0,
      turn_order: rolled,
      log_summary: "",
    });

    await base44.asServiceRole.entities.LogEntry.create({
      campaign_id,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      entry_type: "combat",
      author_label: "DM",
      content: `Combat begins: ${encounter.name}. Turn order — ${rolled.map((r) => `${r.label} (${r.initiative})`).join(", ")}.`,
      related_action_id: null,
    });

    return Response.json({ encounter });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
