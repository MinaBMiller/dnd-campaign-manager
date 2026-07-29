/** Shared helpers for checking campaign membership and stamping denormalized
 * dm_email / party_emails fields onto campaign-scoped child records (Character,
 * NPC, Item, Encounter, Action, DiceRoll, QuestFlag, LogEntry). RLS on those
 * entities can't join back to Campaign, so every child record carries its own
 * copy of who the DM and party are. */

export interface CampaignMembership {
  campaign: any;
  isDm: boolean;
  isPlayer: boolean;
}

export async function loadCampaignMembership(base44: any, campaignId: string, userEmail: string): Promise<CampaignMembership> {
  const campaign = await base44.asServiceRole.entities.Campaign.get(campaignId);
  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }
  const isDm = campaign.dm_email === userEmail;
  const isPlayer = Array.isArray(campaign.player_emails) && campaign.player_emails.includes(userEmail);
  return { campaign, isDm, isPlayer };
}

export function requireMembership(membership: CampaignMembership) {
  if (!membership.isDm && !membership.isPlayer) {
    const err = new Error("You are not a member of this campaign");
    (err as any).status = 403;
    throw err;
  }
}

export function requireDm(membership: CampaignMembership) {
  if (!membership.isDm) {
    const err = new Error("Only the DM can perform this action");
    (err as any).status = 403;
    throw err;
  }
}
