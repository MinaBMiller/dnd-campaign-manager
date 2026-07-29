import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";
import { resolveAction } from "../../shared/resolve-action.ts";

const ECONOMY_SLOT: Record<string, "action" | "bonus_action" | "reaction" | null> = {
  attack: "action",
  spell: "action",
  item_use: "bonus_action",
  move: null,
  skill_check: null,
  dialogue: null,
  end_turn: null,
};

/** The heart of the turn engine: a player or the DM submits an action on behalf of
 * an actor. If it's tied to an active encounter, this validates server-side that
 * it's actually that actor's turn and that the relevant action-economy slot (action /
 * bonus action / reaction) hasn't already been spent this round — no client-side
 * trust. Legal actions are queued as an Action record and immediately resolved. */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id, encounter_id, actor_id, actor_type, action_kind, target_id, target_type, payload } = await req.json();
    if (!campaign_id || !actor_id || !actor_type || !action_kind) {
      return Response.json({ error: "campaign_id, actor_id, actor_type, and action_kind are required" }, { status: 400 });
    }

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireMembership(membership);

    let encounter: any = null;
    if (encounter_id) {
      encounter = await base44.asServiceRole.entities.Encounter.get(encounter_id);
      if (!encounter || encounter.campaign_id !== campaign_id) {
        return Response.json({ error: "Encounter not found in this campaign" }, { status: 404 });
      }
      if (encounter.status !== "active") {
        return Response.json({ error: `Encounter is not active (status: ${encounter.status})` }, { status: 409 });
      }

      const currentTurn = encounter.turn_order?.[encounter.current_turn_index];
      if (!currentTurn || currentTurn.participant_id !== actor_id) {
        return Response.json(
          { error: `It is not ${actor_id}'s turn. Current turn: ${currentTurn?.label ?? "unknown"}` },
          { status: 409 }
        );
      }

      const slot = ECONOMY_SLOT[action_kind];
      if (slot && currentTurn[`${slot}_used`]) {
        return Response.json({ error: `${actor_id} has already used their ${slot.replace("_", " ")} this turn` }, { status: 409 });
      }
    }

    const action = await base44.asServiceRole.entities.Action.create({
      campaign_id,
      encounter_id: encounter_id ?? null,
      dm_email: membership.campaign.dm_email,
      party_emails: membership.campaign.player_emails ?? [],
      actor_id,
      actor_type,
      action_kind,
      target_id: target_id ?? null,
      target_type: target_type ?? null,
      payload: payload ?? {},
      status: "pending",
    });

    const resolved = await resolveAction(base44, action.id);
    return Response.json({ action: resolved });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
