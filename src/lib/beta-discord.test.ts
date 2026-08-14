import { describe, expect, it } from "vitest";
import {
  BETA_DISCORD_BLURB,
  BETA_DISCORD_CTA_LABEL,
  DEFAULT_BETA_DISCORD_URL,
  getBetaDiscordUrl,
} from "@/lib/beta-discord";
import { welcomeEmail } from "@/lib/email/templates";

describe("beta Discord invite", () => {
  it("defaults to the canonical invite URL", () => {
    expect(getBetaDiscordUrl()).toBe(DEFAULT_BETA_DISCORD_URL);
    expect(DEFAULT_BETA_DISCORD_URL).toContain("discord.gg/");
  });

  it("uses a stable CTA label", () => {
    expect(BETA_DISCORD_CTA_LABEL).toBe("Join the Beta Discord");
  });
});

describe("welcomeEmail", () => {
  it("includes the Discord CTA and invite URL", () => {
    const email = welcomeEmail({ firstName: "Alex" });
    expect(email.text).toContain(BETA_DISCORD_BLURB);
    expect(email.text).toContain(BETA_DISCORD_CTA_LABEL);
    expect(email.text).toContain(DEFAULT_BETA_DISCORD_URL);
    expect(email.html).toContain(BETA_DISCORD_CTA_LABEL);
    expect(email.html).toContain(DEFAULT_BETA_DISCORD_URL);
    expect(email.html).toContain("Open your vault");
    expect(email.html).toContain('viewBox="0 0 24 24"');
    expect(email.html).toContain('aria-hidden="true"');
  });
});
