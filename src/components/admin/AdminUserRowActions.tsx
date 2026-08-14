"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { confirmAdminAction } from "@/lib/admin/confirm";

type AdminUserRowActionsProps = {
  userId: string;
  email: string;
  isAdmin: boolean;
  planSlug: string;
  plans: Array<{ slug: string; name: string }>;
  isSelf?: boolean;
};

/**
 * Compact plan + admin controls for the Admin Users list table.
 */
export function AdminUserRowActions({
  userId,
  email,
  isAdmin,
  planSlug,
  plans,
  isSelf = false,
}: AdminUserRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(planSlug);

  useEffect(() => {
    setSelectedPlan(planSlug);
  }, [planSlug]);

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
    }).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed"),
    );
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
    }).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed"),
    );
  }

  return (
    <div className="min-w-[14rem] space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`plan-${userId}`}>
          Plan for {email}
        </label>
        <select
          id={`plan-${userId}`}
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
          disabled={pending}
          className="max-w-[9rem] rounded-md border border-ink/15 bg-canvas px-2 py-1 text-xs text-ink"
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
          className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <button
        type="button"
        disabled={pending || (isSelf && isAdmin)}
        onClick={onToggleAdmin}
        className="rounded-md border border-ink/15 px-2 py-1 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {isAdmin ? "Remove admin" : "Make admin"}
      </button>
      {error ? (
        <p className="text-[11px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
