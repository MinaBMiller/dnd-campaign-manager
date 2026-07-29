import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireDm } from "../../shared/campaign-access.ts";

const PATCHABLE_ENTITIES = ["Character", "NPC", "Item", "Encounter", "Action", "QuestFlag"] as const;

/** DM-only: adds a player to a campaign after creation. Campaign.player_emails is the
 * source of truth, but every campaign-scoped entity denormalizes its own party_emails
 * copy for RLS (cross-entity joins aren't supported), so a newly added player would
 * otherwise be unable to read anything created before they joined. This patches
 * party_emails on all existing mutable child records too, via updateMany + $addToSet.
 * (LogEntry and DiceRoll are immutable by design and are skipped — old log/roll history
 * predating the player simply isn't retroactively visible to them, which is fine.) */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, player_email } = await req.json();
    if (!campaign_id || !player_email) {
      return Response.json({ error: "campaign_id and player_email are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireDm(membership);

    if (membership.campaign.player_emails?.includes(player_email)) {
      return Response.json({ already_member: true });
    }

    await base44.asServiceRole.entities.Campaign.update(campaign_id, {
      player_emails: [...(membership.campaign.player_emails ?? []), player_email],
    });

    for (const entityName of PATCHABLE_ENTITIES) {
      await base44.asServiceRole.entities[entityName].updateMany(
        { campaign_id },
        { $addToSet: { party_emails: player_email } }
      );
    }

    return Response.json({ added: player_email });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
