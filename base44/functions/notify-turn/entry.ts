import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireMembership } from "../../shared/campaign-access.ts";

/** Called directly by the frontend right after any action that may have advanced an
 * Encounter's turn (e.g. right after submit-action), with { encounter_id }. Announces
 * the current turn via a system LogEntry and emails the owning player if it's a
 * Character's turn. Idempotent via last_notified_turn_index/last_notified_round on the
 * Encounter, so calling it more than once for the same turn is harmless. */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { encounter_id } = await req.json();
    if (!encounter_id) return Response.json({ error: "encounter_id is required" }, { status: 400 });

    const encounter = await base44.asServiceRole.entities.Encounter.get(encounter_id);
    if (!encounter) return Response.json({ error: "Encounter not found" }, { status: 404 });

    const membership = await loadCampaignMembership(base44, encounter.campaign_id, user.email);
    requireMembership(membership);

    if (encounter.status !== "active") {
      return Response.json({ skipped: true, reason: `Encounter status is "${encounter.status}", not "active"` });
    }

    const current = encounter.turn_order?.[encounter.current_turn_index];
    if (!current) {
      return Response.json({ skipped: true, reason: "No participant at current_turn_index" });
    }

    const alreadyNotified =
      encounter.last_notified_turn_index === encounter.current_turn_index &&
      encounter.last_notified_round === encounter.round_number;
    if (alreadyNotified) {
      return Response.json({ skipped: true, reason: "Already notified for this turn" });
    }

    await base44.asServiceRole.entities.LogEntry.create({
      campaign_id: encounter.campaign_id,
      dm_email: encounter.dm_email,
      party_emails: encounter.party_emails ?? [],
      entry_type: "system",
      author_label: "System",
      content: `It's now ${current.label}'s turn (round ${encounter.round_number}).`,
    });

    let emailed = false;
    if (current.participant_type === "character") {
      const character = await base44.asServiceRole.entities.Character.get(current.participant_id);
      if (character?.user_email) {
        const campaign = await base44.asServiceRole.entities.Campaign.get(encounter.campaign_id);
        await base44.integrations.Core.SendEmail({
          to: character.user_email,
          subject: `It's your turn in ${campaign?.name ?? "your campaign"}!`,
          body:
            `<p><strong>${current.label}</strong>, it's your turn in <strong>${encounter.name}</strong> ` +
            `(round ${encounter.round_number}).</p><p>Jump back in to keep the party moving.</p>`,
          from_name: campaign?.name ?? "D&D Campaign Manager",
        });
        emailed = true;
      }
    }

    await base44.asServiceRole.entities.Encounter.update(encounter.id, {
      last_notified_turn_index: encounter.current_turn_index,
      last_notified_round: encounter.round_number,
    });

    return Response.json({ notified: current.label, emailed });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
