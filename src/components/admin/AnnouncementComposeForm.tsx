"use client";

import { useState, useTransition } from "react";
import { confirmAdminAction } from "@/lib/admin/confirm";

type SendResult = {
  ok?: boolean;
  considered?: number;
  sent?: number;
  failed?: number;
  skippedPrefs?: number;
  skippedNoEmail?: number;
  dryRun?: boolean;
  error?: string;
};

export function AnnouncementComposeForm() {
  const [featureName, setFeatureName] = useState("");
  const [featureSummary, setFeatureSummary] = useState("");
  const [featureCtaUrl, setFeatureCtaUrl] = useState("/dashboard");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function post(dryRun: boolean) {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        featureName,
        featureSummary,
        featureCtaUrl,
        dryRun,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as SendResult;
    if (!response.ok) {
      throw new Error(data.error ?? "Request failed");
    }
    return data;
  }

  function handlePreview() {
    startTransition(async () => {
      try {
        const data = await post(true);
        setMessage(
          `Dry run: ${data.considered ?? 0} opted-in recipient(s) would receive this announcement.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed");
      }
    });
  }

  function handleSend() {
    if (
      !confirmAdminAction(
        "Send this announcement to every user who opted in to product updates?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const data = await post(false);
        setMessage(
          `Sent ${data.sent ?? 0} of ${data.considered ?? 0} (failed ${data.failed ?? 0}).`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed");
      }
    });
  }

  return (
    <form
      className="mt-6 max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
    >
      <div>
        <label
          htmlFor="announcement-feature-name"
          className="block text-sm font-medium text-ink"
        >
          Feature name
        </label>
        <input
          id="announcement-feature-name"
          value={featureName}
          onChange={(e) => setFeatureName(e.target.value)}
          required
          maxLength={120}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          placeholder="Simple Mode movies"
        />
      </div>
      <div>
        <label
          htmlFor="announcement-summary"
          className="block text-sm font-medium text-ink"
        >
          Summary
        </label>
        <textarea
          id="announcement-summary"
          value={featureSummary}
          onChange={(e) => setFeatureSummary(e.target.value)}
          required
          maxLength={2000}
          rows={5}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          placeholder="A short description of what’s new and why it helps families."
        />
      </div>
      <div>
        <label
          htmlFor="announcement-cta"
          className="block text-sm font-medium text-ink"
        >
          CTA path or URL
        </label>
        <input
          id="announcement-cta"
          value={featureCtaUrl}
          onChange={(e) => setFeatureCtaUrl(e.target.value)}
          required
          maxLength={500}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          placeholder="/movies"
        />
        <p className="mt-1 text-xs text-ink-muted">
          App path (recommended) or absolute URL on this site only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          disabled={pending || !featureName.trim() || !featureSummary.trim()}
          onClick={handlePreview}
          className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
        >
          Preview recipient count
        </button>
        <button
          type="submit"
          disabled={pending || !featureName.trim() || !featureSummary.trim()}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working…" : "Send announcement"}
        </button>
      </div>

      {message ? (
        <p className="text-sm text-accent-deep" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
