"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAdminAction } from "@/lib/admin/confirm";

type AdminUserActionsProps = {
  userId: string;
  email: string;
  isAdmin: boolean;
  isSuspended: boolean;
  planSlug: string;
  plans: Array<{ slug: string; name: string }>;
  /** Hide self-destructive actions for the signed-in admin. */
  isSelf?: boolean;
};

export function AdminUserActions({
  userId,
  email,
  isAdmin,
  isSuspended,
  planSlug,
  plans,
  isSelf = false,
}: AdminUserActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(planSlug);
  const [reason, setReason] = useState("");

  async function run(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    startTransition(() => router.refresh());
  }

  function onSavePlan() {
    const planName =
      plans.find((p) => p.slug === selectedPlan)?.name ?? selectedPlan;
    if (
      !confirmAdminAction(
        `Change plan for ${email} to “${planName}”?\n\nThis updates the database subscription only — it does not change Stripe billing.`,
      )
    ) {
      return;
    }
    void run({
      action: "setPlan",
      userId,
      planSlug: selectedPlan,
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }

  function onToggleAdmin() {
    if (isAdmin) {
      if (
        !confirmAdminAction(
          `Remove admin access for ${email}?\n\nThey will lose /admin tools immediately (unless listed in ADMIN_USER_IDS).`,
        )
      ) {
        return;
      }
    } else if (
      !confirmAdminAction(
        `Grant admin access to ${email}?\n\nThey will be able to manage users, safety, and ops tools.`,
      )
    ) {
      return;
    }

    void run({
      action: "setAdmin",
      userId,
      isAdmin: !isAdmin,
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }

  function onSuspend() {
    if (
      !confirmAdminAction(
        `Suspend ${email}?\n\nThey will be blocked from the app until unsuspended. Data is not deleted.`,
      )
    ) {
      return;
    }
    void run({
      action: "setSuspended",
      userId,
      suspended: true,
      reason: reason || null,
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }

  function onUnsuspend() {
    if (!confirmAdminAction(`Restore access for ${email}?`)) return;
    void run({
      action: "setSuspended",
      userId,
      suspended: false,
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-canvas-deep/30 p-4">
        <h2 className="font-display text-lg text-ink">Change plan</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Support override — database only (not Stripe). Logged to audit.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="admin-plan-select">
            Plan
          </label>
          <select
            id="admin-plan-select"
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            className="rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-sm text-ink"
            disabled={pending}
          >
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || selectedPlan === planSlug}
            onClick={onSavePlan}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-50"
          >
            Save plan
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-canvas-deep/30 p-4">
        <h2 className="font-display text-lg text-ink">Admin access</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Grants or revokes the database <code className="text-ink">is_admin</code>{" "}
          flag.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || (isSelf && isAdmin)}
            onClick={onToggleAdmin}
            className="rounded-md border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {isAdmin ? "Remove admin" : "Make admin"}
          </button>
        </div>
        {isSelf && isAdmin ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            You cannot remove your own admin flag here.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-ink/10 bg-canvas-deep/30 p-4">
        <h2 className="font-display text-lg text-ink">
          {isSuspended ? "Account suspended" : "Suspend account"}
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          Soft flag — blocks app access for {email}. Does not delete data.
        </p>
        {!isSuspended ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-ink-muted" htmlFor="suspend-reason">
              Reason (optional, shown to the user)
            </label>
            <input
              id="suspend-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Terms violation under review"
              className="w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-sm text-ink"
              disabled={pending}
            />
            <button
              type="button"
              disabled={pending || isSelf}
              onClick={onSuspend}
              className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              Suspend user
            </button>
            {isSelf ? (
              <p className="text-[11px] text-ink-muted">
                You cannot suspend your own account.
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onUnsuspend}
            className="mt-3 rounded-md border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            Unsuspend user
          </button>
        )}
      </section>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
