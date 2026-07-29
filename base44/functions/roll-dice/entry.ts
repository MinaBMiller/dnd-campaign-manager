import { createClientFromRequest } from "npm:@base44/sdk";
import { rollFormula, RollMode } from "../../shared/dice.ts";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";

/** Ad-hoc, server-authoritative dice roll (e.g. a DM-called skill check or saving
 * throw that isn't tied to a queued Action). All randomness happens here, never on
 * the client, and the result is written to the immutable DiceRoll audit log. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, formula, mode, purpose, actor_id, actor_label } = await req.json();
    if (!campaign_id || !formula) {
      return Response.json({ error: "campaign_id and formula are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireMembership(membership);

    const rollMode: RollMode = mode === "advantage" || mode === "disadvantage" ? mode : "normal";
    const roll = rollFormula(formula, rollMode);
    const label = actor_label ?? user.username ?? user.email;

    const record = await base44.asServiceRole.entities.DiceRoll.create({
      campaign_id,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      actor_id: actor_id ?? null,
      actor_label: label,
      roll_purpose: purpose ?? "ad-hoc roll",
      formula,
      mode: rollMode,
      dice_results: roll.dice_results,
      modifier: roll.modifier,
      total: roll.total,
      is_critical: roll.is_critical,
      is_fumble: roll.is_fumble,
    });

    await base44.asServiceRole.entities.LogEntry.create({
      campaign_id,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      entry_type: "dice",
      author_email: user.email,
      author_label: label,
      content: `${label} rolls ${formula}${rollMode !== "normal" ? ` (${rollMode})` : ""} for ${purpose ?? "a check"}: ${roll.total}${roll.is_critical ? " — critical!" : ""}${roll.is_fumble ? " — fumble!" : ""}`,
    });

    return Response.json({ roll, record });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
