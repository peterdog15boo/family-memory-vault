"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { EmergencyAccessLegalNotice } from "@/components/emergency-access/EmergencyAccessLegalNotice";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { useFormat } from "@/components/i18n/LocaleProvider";
import type { SerializedEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { EMERGENCY_ACCESS_STATUS_LABELS } from "@/lib/emergency-access/types";

type EmergencyAccessIncomingPanelProps = {
  designations: SerializedEmergencyAccessDesignation[];
};

export function EmergencyAccessIncomingPanel({
  designations: initial,
}: EmergencyAccessIncomingPanelProps) {
  const router = useRouter();
  const format = useFormat();
  const [designations, setDesignations] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestAccess(id: string) {
    if (
      !window.confirm(
        "Request emergency access? The vault owner will be notified. Access is only granted according to their rules.",
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/emergency-access/${id}/request`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit request.");
      setDesignations((prev) =>
        prev.map((d) => (d.id === id ? data.designation : d)),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AppPageIntro
        slot="emergency"
        eyebrow={
          <>
            <ShieldAlert className="size-3.5" aria-hidden />
            Break-glass access
          </>
        }
        title="Emergency Access"
        description="If someone has named you as a trusted emergency contact, you can request read access to their Digital Legacy — only when their rules allow it. Access may be temporary (time-limited) or permanent until they revoke it."
      />

      <div className="legacy-vault documents-vault app-page mx-auto max-w-3xl space-y-6">
        <EmergencyAccessLegalNotice compact />

        {error ? (
          <p className="text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {designations.length ? (
          <ul className="space-y-3">
            {designations.map((d) => {
              const canOpen =
                d.status === "granted" &&
                (d.accessType === "permanent" ||
                  (Boolean(d.grantExpiresAt) &&
                    new Date(d.grantExpiresAt!).getTime() > Date.now()));
              const canRequest =
                d.status === "designated" || d.status === "expired";

              return (
                <li
                  key={d.id}
                  className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg text-[color:var(--legacy-ink)]">
                        {d.ownerDisplayName?.trim() || "Vault owner"}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                        You were designated as {d.designateeName}
                        {d.relationship ? ` (${d.relationship})` : ""}
                      </p>
                      <p className="mt-2 text-xs text-[color:var(--legacy-muted)]">
                        Status: {EMERGENCY_ACCESS_STATUS_LABELS[d.status]}
                        {" · "}
                        {d.accessType === "permanent"
                          ? "Permanent Access"
                          : `${d.grantDurationDays}-day access`}
                      </p>
                      {d.status === "requested" && d.waitingEndsAt ? (
                        <p className="mt-1 text-xs text-amber-900">
                          Waiting period ends{" "}
                          {d.waitingEndsAt
                            ? format.dateTime(d.waitingEndsAt)
                            : null}
                        </p>
                      ) : null}
                      {canOpen && d.accessType === "permanent" ? (
                        <p className="mt-1 text-xs text-[color:var(--legacy-accent-deep)]">
                          Permanent access active — until the owner revokes it
                        </p>
                      ) : null}
                      {canOpen &&
                      d.accessType !== "permanent" &&
                      d.grantExpiresAt ? (
                        <p className="mt-1 text-xs text-[color:var(--legacy-accent-deep)]">
                          Access until{" "}
                          {d.grantExpiresAt
                            ? format.dateTime(d.grantExpiresAt)
                            : null}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {canRequest ? (
                        <button
                          type="button"
                          onClick={() => requestAccess(d.id)}
                          disabled={busyId === d.id}
                          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
                        >
                          <KeyRound className="size-4" aria-hidden />
                          Request access
                        </button>
                      ) : null}
                      {canOpen ? (
                        <Link
                          href={`/emergency-access/${d.ownerUserId}`}
                          className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                        >
                          View Digital Legacy
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl px-6 py-12 text-center">
            <p className="text-sm text-[color:var(--legacy-muted)]">
              No emergency access designations are linked to your account email yet.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
