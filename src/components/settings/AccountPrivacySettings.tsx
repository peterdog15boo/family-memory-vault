"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Bell,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Shield,
  Smartphone,
  UserRound,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { BrowserPushSettings } from "@/components/settings/BrowserPushSettings";
import { LocationSharingSettings } from "@/components/settings/LocationSharingSettings";
import { PasskeySettings } from "@/components/settings/PasskeySettings";
import type {
  AccountPreferenceToggleKey,
  PublicAccountPreferences,
} from "@/lib/account-preferences";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";

type Preferences = Omit<PublicAccountPreferences, "locale">;

type AccountPrivacySettingsProps = {
  initialPreferences: PublicAccountPreferences;
  /** Paid plans only — free users never see the idle-timeout toggle. */
  canDisableIdleTimeout?: boolean;
  /** Effective idle timeout (forced ON for free). */
  idleTimeoutEnabled?: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function AccountPrivacySettings({
  initialPreferences,
  canDisableIdleTimeout = false,
  idleTimeoutEnabled = true,
}: AccountPrivacySettingsProps) {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const t = useTranslations();

  const [displayName, setDisplayName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const { locale: _locale, ...toggles } = initialPreferences;
    void _locale;
    return toggles;
  });
  const [profileState, setProfileState] = useState<SaveState>("idle");
  const [prefsState, setPrefsState] = useState<SaveState>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const displayNameId = useId();
  const profileErrorId = useId();
  const prefsErrorId = useId();
  const emailId = useId();
  const emailHelpId = useId();

  async function loadAppProfile() {
    try {
      const res = await fetch("/api/settings/profile");
      const data = (await res.json().catch(() => ({}))) as {
        profile?: { displayName?: string | null; imageUrl?: string | null };
      };
      if (!res.ok || !data.profile) return;
      console.info("[settings.ui.read]", {
        displayName: data.profile.displayName,
        imageUrl: data.profile.imageUrl
          ? `${data.profile.imageUrl.slice(0, 64)}…`
          : null,
      });
      if (data.profile.displayName?.trim()) {
        setDisplayName(data.profile.displayName.trim());
      }
      if (data.profile.imageUrl?.trim()) {
        setImageUrl(data.profile.imageUrl.trim());
      }
    } catch {
      // Fall back to Clerk below.
    }
  }

  useEffect(() => {
    if (!isLoaded || !user) return;
    // Prefer app profile (Ava + Settings shared DB); fall back to Clerk.
    setDisplayName(user.fullName || user.firstName || "");
    setImageUrl(user.imageUrl ?? null);
    void loadAppProfile();
  }, [isLoaded, user]);

  // Refresh when returning to Settings after Ava (tab focus / visibility).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadAppProfile();
        void user?.reload?.();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user]);

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses[0]?.emailAddress ||
    "";

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;

    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError(t("settings.displayNameRequired"));
      setProfileState("error");
      return;
    }

    setProfileState("saving");
    setProfileError(null);
    try {
      const parts = trimmed.split(/\s+/);
      const firstName = parts[0] ?? trimmed;
      const lastName = parts.slice(1).join(" ") || undefined;
      await user.update({ firstName, lastName: lastName || "" });
      const syncRes = await fetch("/api/settings/profile/sync", {
        method: "POST",
      });
      const syncData = (await syncRes.json().catch(() => ({}))) as {
        profile?: { displayName?: string | null; imageUrl?: string | null };
      };
      if (syncData.profile?.displayName?.trim()) {
        setDisplayName(syncData.profile.displayName.trim());
      }
      if (syncData.profile?.imageUrl?.trim()) {
        setImageUrl(syncData.profile.imageUrl.trim());
      }
      await user.reload();
      setProfileState("saved");
      announce(t("a11y.settingsSaved"), { priority: "polite" });
      window.setTimeout(() => setProfileState("idle"), 2500);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Could not update profile.",
      );
      setProfileState("error");
    }
  }

  async function savePreference(
    key: AccountPreferenceToggleKey,
    value: boolean,
  ) {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setPrefsState("saving");
    setPrefsError(null);
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not save preference.");
      }
      if (data.preferences) {
        const { locale: _locale, ...toggles } = data.preferences as PublicAccountPreferences;
        void _locale;
        setPrefs(toggles);
      }
      if (key === "idleTimeoutEnabled" && data.idleTimeout) {
        window.dispatchEvent(
          new CustomEvent("fmv:idle-timeout-policy", {
            detail: data.idleTimeout,
          }),
        );
      }
      if (key === "notificationSoundEnabled") {
        window.dispatchEvent(
          new CustomEvent("fmv:notification-sound-pref", {
            detail: { enabled: value },
          }),
        );
      }
      if (key === "celebrationSoundEnabled") {
        window.dispatchEvent(
          new CustomEvent("fmv:celebration-sound-pref", {
            detail: { enabled: value },
          }),
        );
      }
      if (key === "askAiRobotGreetingsEnabled") {
        window.dispatchEvent(
          new CustomEvent("fmv:ask-ai-greeting-pref", {
            detail: { enabled: value },
          }),
        );
      }
      setPrefsState("saved");
      announce(t("a11y.settingsSaved"), { priority: "polite" });
      window.setTimeout(() => setPrefsState("idle"), 2000);
    } catch (err) {
      setPrefs(previous);
      setPrefsError(
        err instanceof Error ? err.message : "Could not save preference.",
      );
      setPrefsState("error");
    }
  }

  return (
    <div id="account-privacy" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl tracking-tight text-ink">
          {t("settings.accountPrivacyTitle")}
        </h2>
        <p className="page-lead mt-2 text-sm leading-relaxed text-ink-muted">
          {t("settings.accountPrivacyLead")}
        </p>
      </div>

      {/* Profile */}
      <section className="ui-card ui-card-elevated ui-card-pad-lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <UserRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg tracking-tight text-ink">
              {t("settings.profile")}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {t("settings.profileLead")}
            </p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="mt-6 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]">
              {imageUrl ? (
                // Clerk CDN avatar
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-ink-muted">
                  <UserRound className="size-6" aria-hidden />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-muted">
                {t("settings.profilePhotoHelp")}
              </p>
              <button
                type="button"
                onClick={() => openUserProfile()}
                className="ui-btn ui-btn-secondary ui-btn-sm mt-2"
              >
                {t("settings.managePhoto")}
                <ExternalLink className="size-3.5 opacity-70" aria-hidden />
              </button>
            </div>
          </div>

          <label className="block" htmlFor={displayNameId}>
            <span className="ui-label">
              {t("settings.displayName")}
              <span className="text-red-700" aria-hidden="true">
                {" "}
                *
              </span>
              <span className="sr-only"> ({t("common.required")})</span>
            </span>
            <input
              id={displayNameId}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              disabled={!isLoaded || profileState === "saving"}
              className="ui-input mt-1.5"
              autoComplete="name"
              required
              aria-required="true"
              aria-invalid={profileError ? true : undefined}
              aria-describedby={profileError ? profileErrorId : undefined}
            />
          </label>

          <label className="block" htmlFor={emailId}>
            <span className="ui-label">{t("settings.email")}</span>
            <input
              id={emailId}
              value={email}
              readOnly
              disabled
              aria-describedby={emailHelpId}
              className="ui-input mt-1.5 opacity-80"
            />
            <span id={emailHelpId} className="mt-1.5 block text-xs text-ink-muted">
              {t("settings.emailHelp")}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!isLoaded || profileState === "saving"}
              className="ui-btn ui-btn-primary"
            >
              {profileState === "saving" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("settings.saving")}
                </>
              ) : (
                t("settings.saveProfile")
              )}
            </button>
            {profileState === "saved" ? (
              <span className="inline-flex items-center gap-1 text-sm text-[color:var(--accent-deep)]">
                <Check className="size-4" aria-hidden />
                {t("settings.saved")}
              </span>
            ) : null}
          </div>
          {profileError ? (
            <p
              id={profileErrorId}
              role="alert"
              className="rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {profileError}
            </p>
          ) : null}
        </form>
      </section>

      {/* Notifications */}
      <section className="ui-card ui-card-elevated ui-card-pad-lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <Bell className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg tracking-tight text-ink">
              {t("settings.notifications")}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {t("settings.notificationsLead")}{" "}
              <Link
                href="/notifications"
                className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              >
                {t("settings.openInbox")}
              </Link>
            </p>
          </div>
          {prefsState === "saved" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--accent-deep)]">
              <Check className="size-3.5" aria-hidden />
              {t("settings.saved")}
            </span>
          ) : prefsState === "saving" ? (
            <Loader2
              className="size-4 animate-spin text-ink-muted"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="mt-6 space-y-6">
          <PreferenceGroup
            title={t("settings.emailGroup")}
            icon={<Mail className="size-3.5" aria-hidden />}
          >
            <ToggleRow
              label={t("settings.movieReady")}
              description={t("settings.movieReadyEmail")}
              checked={prefs.emailMovieReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailMovieReady", v)}
            />
            <ToggleRow
              label={t("settings.familyInvites")}
              description={t("settings.familyInvitesEmail")}
              checked={prefs.emailFamilyInvite}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailFamilyInvite", v)}
            />
            <ToggleRow
              label={t("settings.storageWarnings")}
              description={t("settings.storageWarningsEmail")}
              checked={prefs.emailStorageWarnings}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailStorageWarnings", v)}
            />
            <ToggleRow
              label={t("settings.milestoneEmails")}
              description={t("settings.milestoneEmailsHelp")}
              checked={prefs.emailMilestoneCelebrations}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailMilestoneCelebrations", v)}
            />
            <ToggleRow
              label={t("settings.weeklyDigest")}
              description={t("settings.weeklyDigestEmail")}
              checked={prefs.emailWeeklyDigest}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailWeeklyDigest", v)}
            />
            <ToggleRow
              label={t("settings.featureTips")}
              description={t("settings.featureTipsHelp")}
              checked={prefs.emailFeatureTips}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailFeatureTips", v)}
            />
            <ToggleRow
              label={t("settings.weeklyIdeas")}
              description={t("settings.weeklyIdeasHelp")}
              checked={prefs.emailWeeklyIdeas}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailWeeklyIdeas", v)}
            />
          </PreferenceGroup>

          <PreferenceGroup
            title={t("settings.inAppGroup")}
            icon={<Bell className="size-3.5" aria-hidden />}
          >
            <ToggleRow
              label={t("settings.movieReady")}
              checked={prefs.inAppMovieReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppMovieReady", v)}
            />
            <ToggleRow
              label={t("settings.familyInvites")}
              checked={prefs.inAppFamilyInvite}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppFamilyInvite", v)}
            />
            <ToggleRow
              label={t("settings.storageWarnings")}
              checked={prefs.inAppStorageWarnings}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppStorageWarnings", v)}
            />
            <ToggleRow
              label={t("settings.mediaReady")}
              description={t("settings.mediaReadyInApp")}
              checked={prefs.inAppMediaReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppMediaReady", v)}
            />
            <ToggleRow
              label={t("settings.emergencyAccessAlert")}
              description={t("settings.emergencyAccessInApp")}
              checked={prefs.inAppEmergencyAccess}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppEmergencyAccess", v)}
            />
            <ToggleRow
              label={t("settings.weeklyDigest")}
              description={t("settings.weeklyDigestInApp")}
              checked={prefs.inAppWeeklyDigest}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppWeeklyDigest", v)}
            />
            <ToggleRow
              label={t("settings.notificationSound")}
              description={t("settings.notificationSoundHelp")}
              checked={prefs.notificationSoundEnabled}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("notificationSoundEnabled", v)}
            />
            <ToggleRow
              label={t("settings.celebrationSound")}
              description={t("settings.celebrationSoundHelp")}
              checked={prefs.celebrationSoundEnabled}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("celebrationSoundEnabled", v)}
            />
            <ToggleRow
              label={t("settings.askAiRobotGreetings")}
              description={t("settings.askAiRobotGreetingsHelp")}
              checked={prefs.askAiRobotGreetingsEnabled}
              disabled={prefsState === "saving"}
              onChange={(v) =>
                void savePreference("askAiRobotGreetingsEnabled", v)
              }
            />
          </PreferenceGroup>

          <PreferenceGroup
            title={t("settings.browserPushGroup")}
            icon={<Smartphone className="size-3.5" aria-hidden />}
          >
            <BrowserPushSettings />
          </PreferenceGroup>
        </div>

        {prefsError ? (
          <p
            id={prefsErrorId}
            role="alert"
            className="mt-4 rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {prefsError}
          </p>
        ) : null}
      </section>

      {/* Privacy */}
      <section className="ui-card ui-card-elevated ui-card-pad-lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <Shield className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg tracking-tight text-ink">
              {t("settings.privacySectionTitle")}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {t("settings.privacySectionLead")}
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-3 text-sm leading-relaxed text-ink-muted">
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">
              {t("settings.familySharingTitle")}
            </strong>{" "}
            {t("settings.familySharingBody")}
          </li>
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">
              {t("settings.noPublicProfilesTitle")}
            </strong>{" "}
            {t("settings.noPublicProfilesBody")}
          </li>
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">
              {t("settings.accountSecurityTitle")}
            </strong>{" "}
            {t("settings.accountSecurityBody")}{" "}
            <button
              type="button"
              onClick={() => openUserProfile()}
              className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
            >
              {t("settings.openAccountSettings")}
            </button>
          </li>
        </ul>

        <PasskeySettings />

        {canDisableIdleTimeout ? (
          <div className="mt-5 border-t border-[color:var(--border-subtle)] pt-5">
            <ToggleRow
              label={t("settings.idleTimeout")}
              description={t("settings.idleTimeoutHelp")}
              checked={prefs.idleTimeoutEnabled ?? idleTimeoutEnabled}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("idleTimeoutEnabled", v)}
            />
          </div>
        ) : null}

        <div
          id="family-location"
          className="mt-5 scroll-mt-24 border-t border-[color:var(--border-subtle)] pt-5"
        >
          <h4 className="text-sm font-medium text-ink">
            {t("settings.locationSharingTitle")}
          </h4>
          <p className="mt-1 text-sm text-ink-muted">
            {t("settings.locationSharingLead")}
          </p>
          <div className="mt-4">
            <LocationSharingSettings />
          </div>
        </div>

        <div className="mt-5 border-t border-[color:var(--border-subtle)] pt-5">
          <ToggleRow
            label={t("settings.productUpdates")}
            description={t("settings.productUpdatesDescription")}
            checked={prefs.productUpdatesEmail}
            disabled={prefsState === "saving"}
            onChange={(v) => void savePreference("productUpdatesEmail", v)}
          />
        </div>

        <p className="mt-5 text-sm text-ink-muted">
          {t("settings.readMoreLegal")
            .split(/\{terms\}|\{privacy\}/)
            .map((part, i) => {
              if (i === 0) return <span key="a">{part}</span>;
              if (i === 1) {
                return (
                  <span key="b">
                    <Link
                      href="/terms"
                      className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
                    >
                      {t("settings.termsOfService")}
                    </Link>
                    {part}
                  </span>
                );
              }
              return (
                <span key="c">
                  <Link
                    href="/privacy"
                    className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
                  >
                    {t("settings.privacyOverview")}
                  </Link>
                  {part}
                </span>
              );
            })}
        </p>
      </section>
    </div>
  );
}

function PreferenceGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {icon}
        {title}
      </p>
      <div className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface)]">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 px-4 py-3.5",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-[color:var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
