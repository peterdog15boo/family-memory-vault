"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Bell,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Shield,
  UserRound,
} from "lucide-react";
import type { AccountPreferenceToggleKey } from "@/lib/account-preferences";
import { cn } from "@/lib/utils";

type Preferences = Record<AccountPreferenceToggleKey, boolean>;

type AccountPrivacySettingsProps = {
  initialPreferences: Preferences;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function AccountPrivacySettings({
  initialPreferences,
}: AccountPrivacySettingsProps) {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();

  const [displayName, setDisplayName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [profileState, setProfileState] = useState<SaveState>("idle");
  const [prefsState, setPrefsState] = useState<SaveState>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

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
      setProfileError("Display name is required.");
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
      if (data.preferences) setPrefs(data.preferences);
      if (key === "notificationSoundEnabled") {
        window.dispatchEvent(
          new CustomEvent("fmv:notification-sound-pref", {
            detail: { enabled: value },
          }),
        );
      }
      setPrefsState("saved");
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
          Account &amp; privacy
        </h2>
        <p className="page-lead mt-2 text-sm leading-relaxed text-ink-muted">
          Manage your profile, alerts, and how Family Memory Vault uses your
          account information.
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
              Profile
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Your name and photo are shared with Ava tips and your account
              profile.
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
                Profile photo is managed in your account settings.
              </p>
              <button
                type="button"
                onClick={() => openUserProfile()}
                className="ui-btn ui-btn-secondary ui-btn-sm mt-2"
              >
                Manage photo &amp; security
                <ExternalLink className="size-3.5 opacity-70" aria-hidden />
              </button>
            </div>
          </div>

          <label className="block">
            <span className="ui-label">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              disabled={!isLoaded || profileState === "saving"}
              className="ui-input mt-1.5"
              autoComplete="name"
              required
            />
          </label>

          <label className="block">
            <span className="ui-label">Email</span>
            <input
              value={email}
              readOnly
              disabled
              className="ui-input mt-1.5 opacity-80"
            />
            <span className="mt-1.5 block text-xs text-ink-muted">
              Email comes from your Clerk sign-in. Use Manage account to add or
              change addresses.
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
                  Saving…
                </>
              ) : (
                "Save profile"
              )}
            </button>
            {profileState === "saved" ? (
              <span className="inline-flex items-center gap-1 text-sm text-[color:var(--accent-deep)]">
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            ) : null}
          </div>
          {profileError ? (
            <p className="rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
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
              Notifications
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Choose which emails and in-app alerts you receive. Changes save
              immediately.{" "}
              <Link
                href="/notifications"
                className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              >
                Open notification inbox
              </Link>
            </p>
          </div>
          {prefsState === "saved" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--accent-deep)]">
              <Check className="size-3.5" aria-hidden />
              Saved
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
            title="Email"
            icon={<Mail className="size-3.5" aria-hidden />}
          >
            <ToggleRow
              label="Movie ready"
              description="When a memory movie finishes rendering."
              checked={prefs.emailMovieReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailMovieReady", v)}
            />
            <ToggleRow
              label="Family invitations"
              description="When someone with an account invites you (new invitees always get the invite email)."
              checked={prefs.emailFamilyInvite}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailFamilyInvite", v)}
            />
            <ToggleRow
              label="Storage warnings"
              description="When your vault is nearly full or at capacity."
              checked={prefs.emailStorageWarnings}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("emailStorageWarnings", v)}
            />
          </PreferenceGroup>

          <PreferenceGroup
            title="In-app"
            icon={<Bell className="size-3.5" aria-hidden />}
          >
            <ToggleRow
              label="Movie ready"
              checked={prefs.inAppMovieReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppMovieReady", v)}
            />
            <ToggleRow
              label="Family invitations"
              checked={prefs.inAppFamilyInvite}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppFamilyInvite", v)}
            />
            <ToggleRow
              label="Storage warnings"
              checked={prefs.inAppStorageWarnings}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppStorageWarnings", v)}
            />
            <ToggleRow
              label="Photos ready"
              description="When an upload finishes moderation."
              checked={prefs.inAppMediaReady}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppMediaReady", v)}
            />
            <ToggleRow
              label="Emergency access"
              description="Requests and decisions for Digital Legacy emergency access (in-app only)."
              checked={prefs.inAppEmergencyAccess}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("inAppEmergencyAccess", v)}
            />
            <ToggleRow
              label="Play sound for new notifications"
              description="A soft ding when something new arrives while you’re using the app."
              checked={prefs.notificationSoundEnabled}
              disabled={prefsState === "saving"}
              onChange={(v) => void savePreference("notificationSoundEnabled", v)}
            />
          </PreferenceGroup>
        </div>

        {prefsError ? (
          <p className="mt-4 rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
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
              Privacy
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Plain-language notes about how sharing works in this vault.
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-3 text-sm leading-relaxed text-ink-muted">
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">Family sharing.</strong>{" "}
            Family members you invite can see memories and media you choose to
            share. Private Documents and Digital Legacy stay owner-only unless
            you grant emergency access.
          </li>
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">No public profiles.</strong>{" "}
            Family Memory Vault is not a social network. There is no public
            presence or feed for other families to discover you.
          </li>
          <li className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
            <strong className="font-medium text-ink">Account security.</strong>{" "}
            Password, email, and multi-factor authentication are managed in your
            Clerk account.{" "}
            <button
              type="button"
              onClick={() => openUserProfile()}
              className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
            >
              Open account settings
            </button>
          </li>
        </ul>

        <div className="mt-5 border-t border-[color:var(--border-subtle)] pt-5">
          <ToggleRow
            label="Product update emails"
            description="Occasional product news from Family Memory Vault. Off by default. Transactional emails (like welcome or storage alerts you enable above) are separate."
            checked={prefs.productUpdatesEmail}
            disabled={prefsState === "saving"}
            onChange={(v) => void savePreference("productUpdatesEmail", v)}
          />
        </div>

        <p className="mt-5 text-sm text-ink-muted">
          Read more in our{" "}
          <Link
            href="/privacy"
            className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
          >
            Privacy overview
          </Link>
          .
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
        className="mt-1 size-4 shrink-0 accent-[color:var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
