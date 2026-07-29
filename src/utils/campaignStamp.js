export function isDm(campaign, user) {
  return !!campaign && !!user && campaign.dm_email === user.email
}
