import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";

/** Creates a 'chat' LogEntry on behalf of the caller (DM or any party member).
 * Routed through a function (service-role write) rather than a direct client-side
 * entities.LogEntry.create() call: create-time RLS evaluation of array fields like
 * party_emails proved unreliable in practice (confirmed empirically — reads against
 * the same kind of array field work fine, but create-time array-containment checks on
 * the incoming payload did not), whereas asServiceRole writes gated by an explicit
 * membership check in code are the pattern already used everywhere else in this app. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, content } = await req.json();
    if (!campaign_id || !content?.trim()) {
      return Response.json({ error: "campaign_id and content are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireMembership(membership);

    const displayName = user.username || user.email;
    const [character] = await base44.asServiceRole.entities.Character.filter({ campaign_id, user_email: user.email });
    const author_label = character ? `${character.name} (${displayName})` : displayName;

    const entry = await base44.asServiceRole.entities.LogEntry.create({
      campaign_id,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      entry_type: "chat",
      author_email: user.email,
      author_label,
      content: content.trim(),
    });

    return Response.json({ entry });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
