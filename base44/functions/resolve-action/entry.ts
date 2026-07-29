import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireDm } from "../../shared/campaign-access.ts";
import { resolveAction } from "../../shared/resolve-action.ts";

/** DM-only: resolves an Action that was left pending (e.g. queued while the DM was
 * offline, per the async multiplayer model where players don't need to be online
 * simultaneously). Idempotent — resolving an already-resolved action is a no-op. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action_id } = await req.json();
    if (!action_id) return Response.json({ error: "action_id is required" }, { status: 400 });

    const action = await base44.asServiceRole.entities.Action.get(action_id);
    if (!action) return Response.json({ error: "Action not found" }, { status: 404 });

    const membership = await loadCampaignMembership(base44, action.campaign_id, user.email);
    requireDm(membership);

    const resolved = await resolveAction(base44, action_id);
    return Response.json({ action: resolved });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
