import { createClientFromRequest } from "npm:@base44/sdk";
import { loadCampaignMembership, requireDm } from "../../shared/campaign-access.ts";
import { skipAi } from "../../shared/mock-ai.ts";

/** DM-only "what should happen next" nudge — optional, not a requirement. Grounded in
 * the campaign's actual current scene, world state, quest flags, and recent log
 * entries, so it's a specific suggestion rather than generic advice. Purely
 * informational: nothing is written to any entity, the DM decides what to do with it
 * (e.g. paste it into current_scene, or ignore it). */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { campaign_id } = await req.json();
    if (!campaign_id) return Response.json({ error: "campaign_id is required" }, { status: 400 });

    const membership = await loadCampaignMembership(base44, campaign_id, user.email);
    requireDm(membership);
    if (membership.campaign.ai_features?.next_beat_suggestions === false) {
      return Response.json({ error: "This AI suggestion feature is turned off for this campaign" }, { status: 403 });
    }

    if (skipAi()) {
      return Response.json({ suggestions: ["[MOCK] A stand-in suggestion for a real AI-generated one."] });
    }

    const [questFlags, recentLogs] = await Promise.all([
      base44.asServiceRole.entities.QuestFlag.filter({ campaign_id }, null, 20),
      base44.asServiceRole.entities.LogEntry.filter({ campaign_id }, "-created_date", 10),
    ]);

    const response = await base44.integrations.Core.InvokeLLM({
      prompt:
        "You are helping a Dungeon Master who may not be very experienced with tabletop " +
        "games figure out what should happen next in their session. Give 2-3 short, " +
        "concrete suggestions (not generic advice) for what could happen next, grounded " +
        "in the actual state below. Keep each suggestion to one sentence.\n\n" +
        `Current scene: ${membership.campaign.current_scene || "(not set)"}\n` +
        `Campaign premise: ${membership.campaign.description || "(not set)"}\n` +
        `World state: ${JSON.stringify(membership.campaign.world_state ?? {})}\n` +
        `Open quest flags: ${JSON.stringify(questFlags.map((f: any) => ({ key: f.flag_key, value: f.flag_value, desc: f.description })))}\n` +
        `Recent events (most recent first): ${JSON.stringify(recentLogs.map((l: any) => l.content))}`,
      response_json_schema: {
        type: "object",
        properties: {
          suggestions: { type: "array", items: { type: "string" } },
        },
      },
    });

    return Response.json({ suggestions: (response as any).suggestions ?? [] });
  } catch (error) {
    const status = (error as any).status ?? 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
