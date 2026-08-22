import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Heart, KeyRound, Landmark, Users } from "lucide-react";
import { AccountUsageOverview } from "@/components/billing/AccountUsageOverview";
import { CurrentPlanBadge } from "@/components/billing/CurrentPlanBadge";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { AccountPrivacySettings } from "@/components/settings/AccountPrivacySettings";
import { MediaConnectionsSettings } from "@/components/settings/MediaConnectionsSettings";
import { AvaSettingsCard } from "@/components/ava/AvaSettingsCard";
import { ThemeSettingsSection } from "@/components/theme/ThemeSettingsSection";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  getAccountPreferences,
  getIdleTimeoutPolicyForUser,
  publicAccountPreferences,
} from "@/lib/account-preferences";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import {
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import { getTranslations } from "@/lib/i18n/server";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureFreeSubscription } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

/**
 * Account settings hub — family sharing lives on /family; billing on /billing.
 */
export default async function SettingsPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  await ensureFreeSubscription(userId);

  const [summary, preferences, idleTimeout, t, legacyPlusGate] =
    await Promise.all([
      getAccountUsageSummary(userId),
      getAccountPreferences(userId),
      getIdleTimeoutPolicyForUser(userId),
      getTranslations(),
      canUseLegacyPlusFeatures(userId),
    ]);
  const showLegacyPlusLinks = legacyPlusGate.allowed;
  const stripeConfigured = isStripeConfigured();
  const betaMode = isBetaPlanPickerEnabled() || isBetaBillingOverride();

  return (
    <>
      <AppPageIntro
        slot="settings"
        compact
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="app-page mx-auto max-w-3xl">
        <div className="app-stack space-y-6">
          <LanguageSwitcher />

          <ThemeSettingsSection />

          <AvaSettingsCard />

          <UsageLimitBanner summary={summary} />

          <AccountUsageOverview summary={summary} variant="compact" />

          <section id="billing" className="space-y-4">
            <CurrentPlanBadge
              planName={summary.planName}
              planSlug={summary.planSlug}
              billingInterval={summary.billingInterval}
              planSource={summary.planSource}
              canManageBilling={summary.canManageBilling}
              stripeConfigured={stripeConfigured}
              betaMode={betaMode}
            />
            <p className="text-sm text-ink-muted">
              {t("settings.billingHelp").split("{billing}")[0]}
              <Link
                href="/billing"
                className="font-medium text-accent-deep hover:text-accent"
              >
                {t("settings.billingLink")}
              </Link>
              {t("settings.billingHelp").split("{billing}")[1] ?? ""}
            </p>
          </section>

          <AccountPrivacySettings
            initialPreferences={publicAccountPreferences(preferences)}
            canDisableIdleTimeout={idleTimeout.canDisable}
            idleTimeoutEnabled={idleTimeout.enabled}
          />

          <MediaConnectionsSettings />
        </div>

        <ul className="settings-link-list mt-6 space-y-3">
          {showLegacyPlusLinks ? (
            <li>
              <Link
                href="/accounts"
                className="settings-link-card group flex items-start gap-4 rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-4 transition hover:border-accent/35 hover:bg-accent/5"
              >
                <span className="settings-link-icon mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
                  <Landmark className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg tracking-tight text-ink group-hover:text-accent-deep">
                    {t("settings.connectedAccounts")}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                    {t("settings.connectedAccountsDescription")}
                  </span>
                </span>
              </Link>
            </li>
          ) : null}
          {showLegacyPlusLinks ? (
            <li>
              <Link
                href="/legacy"
                className="settings-link-card group flex items-start gap-4 rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-4 transition hover:border-accent/35 hover:bg-accent/5"
              >
                <span className="settings-link-icon mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
                  <Heart className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg tracking-tight text-ink group-hover:text-accent-deep">
                    {t("settings.digitalLegacy")}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                    {t("settings.digitalLegacyDescription")}
                  </span>
                </span>
              </Link>
            </li>
          ) : null}
          <li>
            <Link
              href="/emergency-access"
              className="settings-link-card group flex items-start gap-4 rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-4 transition hover:border-accent/35 hover:bg-accent/5"
            >
              <span className="settings-link-icon mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
                <KeyRound className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg tracking-tight text-ink group-hover:text-accent-deep">
                  {t("settings.emergencyAccess")}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                  {t("settings.emergencyAccessDescription")}
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/family"
              className="settings-link-card group flex items-start gap-4 rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-4 transition hover:border-accent/35 hover:bg-accent/5"
            >
              <span className="settings-link-icon mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
                <Users className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg tracking-tight text-ink group-hover:text-accent-deep">
                  {t("settings.family")}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                  {t("settings.familyDescription")}
                </span>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}
