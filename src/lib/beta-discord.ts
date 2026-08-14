/**
 * Beta Discord invite — feedback dialog + welcome email.
 * Override with NEXT_PUBLIC_BETA_DISCORD_URL when needed.
 */
export const DEFAULT_BETA_DISCORD_URL = "https://discord.gg/VdzQztVgb";

export const BETA_DISCORD_CTA_LABEL = "Join the Beta Discord";

export const BETA_DISCORD_BLURB =
  "Join other beta testers on Discord for updates and discussion.";

export function getBetaDiscordUrl(): string {
  const url = process.env.NEXT_PUBLIC_BETA_DISCORD_URL?.trim();
  return url || DEFAULT_BETA_DISCORD_URL;
}
