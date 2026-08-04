"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { EmergencyAccessLegalNotice } from "@/components/emergency-access/EmergencyAccessLegalNotice";
import type { SerializedEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import {
  EMERGENCY_ACCESS_STATUS_LABELS,
  MANUAL_ONLY_WAITING_PERIOD_HOURS,
  TEMPORARY_GRANT_DURATION_DAYS,
  emergencyAccessDurationLabel,
  type EmergencyAccessType,
} from "@/lib/emergency-access/types";

type EmergencyAccessOwnerPanelProps = {
  designations: SerializedEmergencyAccessDesignation[];
};

type DesignationDraft = {
  designateeEmail: string;
  designateeName: string;
  relationship: string;
  waitingPeriodHours: number;
  accessType: EmergencyAccessType;
  ownerNotes: string;
};

const EMPTY_DRAFT: DesignationDraft = {
  designateeEmail: "",
  designateeName: "",
  relationship: "",
  waitingPeriodHours: 72,
  accessType: "temporary",
  ownerNotes: "",
};

function draftFromDesignation(
  d: SerializedEmergencyAccessDesignation,
): DesignationDraft {
  return {
    designateeEmail: d.designateeEmail,
    designateeName: d.designateeName,
    relationship: d.relationship ?? "",
    waitingPeriodHours: d.waitingPeriodHours,
    accessType: d.accessType,
    ownerNotes: d.ownerNotes ?? "",
  };
}

function canEditDesignation(
  status: SerializedEmergencyAccessDesignation["status"],
): boolean {
  return (
    status === "designated" || status === "denied" || status === "expired"
  );
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EmergencyAccessOwnerPanel({
  designations: initial,
}: EmergencyAccessOwnerPanelProps) {
  const router = useRouter();
  const [designations, setDesignations] = useState(initial);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DesignationDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  function startCreate() {
    setError(null);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormMode("create");
  }

  function startEdit(d: SerializedEmergencyAccessDesignation) {
    setError(null);
    if (!canEditDesignation(d.status)) {
      setError(
        d.status === "granted"
          ? "Revoke access before editing this contact."
          : "Deny or wait out the request before editing this contact.",
      );
      return;
    }
    setEditingId(d.id);
    setDraft(draftFromDesignation(d));
    setFormMode("edit");
  }

  async function saveDesignation(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setError(null);
    try {
      const payload = {
        designateeEmail: draft.designateeEmail.trim(),
        designateeName: draft.designateeName.trim(),
        relationship: draft.relationship.trim() || null,
        waitingPeriodHours: draft.waitingPeriodHours,
        accessType: draft.accessType,
        grantDurationDays:
          draft.accessType === "temporary"
            ? TEMPORARY_GRANT_DURATION_DAYS
            : undefined,
        ownerNotes: draft.ownerNotes.trim() || null,
      };

      if (formMode === "edit" && editingId) {
        const res = await fetch(`/api/emergency-access/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not update contact.");
        setDesignations((prev) =>
          prev.map((d) => (d.id === editingId ? data.designation : d)),
        );
      } else {
        const res = await fetch("/api/emergency-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not add contact.");
        setDesignations((prev) => [data.designation, ...prev]);
      }

      closeForm();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formMode === "edit"
            ? "Could not update contact."
            : "Could not add contact.",
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function act(
    id: string,
    action: "grant" | "deny" | "reset" | "delete",
  ) {
    setBusyId(id);
    setError(null);
    try {
      if (action === "delete") {
        if (!window.confirm("Remove this emergency contact designation?")) return;
        const res = await fetch(`/api/emergency-access/${id}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not remove.");
        setDesignations((prev) => prev.filter((d) => d.id !== id));
        if (editingId === id) closeForm();
      } else {
        if (action === "reset") {
          const target = designations.find((d) => d.id === id);
          if (
            target?.status === "granted" &&
            !window.confirm(
              "Revoke access for this contact? They will lose Digital Legacy access immediately.",
            )
          ) {
            return;
          }
        }
        const res = await fetch(`/api/emergency-access/${id}/${action}`, {
          method: "POST",
          headers:
            action === "deny"
              ? { "Content-Type": "application/json" }
              : undefined,
          body: action === "deny" ? JSON.stringify({}) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Action failed.");
        setDesignations((prev) =>
          prev.map((d) => (d.id === id ? data.designation : d)),
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <EmergencyAccessLegalNotice />

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Shield
            className="mt-1 size-5 text-[color:var(--legacy-accent)]"
            aria-hidden
          />
          <div>
            <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
              Emergency Access
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
              Name trusted people who may request break-glass access to your
              Digital Legacy. This is separate from family sharing — they only see
              what you leave here, and only after the rules below are satisfied.
              You can revoke access at any time.
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {designations.length ? (
          <ul className="mt-5 space-y-3">
            {designations.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[color:var(--legacy-ink)]">
                        {d.designateeName}
                      </p>
                      <span className="rounded-full border border-[color:var(--legacy-line)] px-2 py-0.5 text-[11px] text-[color:var(--legacy-muted)]">
                        {EMERGENCY_ACCESS_STATUS_LABELS[d.status]}
                      </span>
                      <span className="rounded-full border border-[color:var(--legacy-line)] px-2 py-0.5 text-[11px] text-[color:var(--legacy-muted)]">
                        {d.accessType === "permanent"
                          ? "Permanent"
                          : `${d.grantDurationDays}-day`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                      {d.designateeEmail}
                      {d.relationship ? ` · ${d.relationship}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-[color:var(--legacy-muted)]">
                      Waiting period:{" "}
                      {d.waitingPeriodHours === MANUAL_ONLY_WAITING_PERIOD_HOURS
                        ? "Manual approval only"
                        : `${d.waitingPeriodHours} hours`}
                      {" · "}
                      {d.accessType === "permanent"
                        ? "Permanent Access (until you revoke)"
                        : `Grant lasts ${emergencyAccessDurationLabel(d)}`}
                    </p>
                    {d.status === "requested" && d.waitingEndsAt ? (
                      <p className="mt-1 text-xs text-amber-900">
                        Waiting ends {formatWhen(d.waitingEndsAt)}
                        {d.waitingPeriodHours > 0
                          ? " (auto-grant unless you deny)"
                          : ""}
                      </p>
                    ) : null}
                    {d.status === "granted" && d.accessType === "permanent" ? (
                      <p className="mt-1 text-xs text-[color:var(--legacy-accent-deep)]">
                        Permanent access active
                        {d.grantedBy ? ` · ${d.grantedBy}` : ""} — does not
                        expire until you revoke
                      </p>
                    ) : null}
                    {d.status === "granted" &&
                    d.accessType !== "permanent" &&
                    d.grantExpiresAt ? (
                      <p className="mt-1 text-xs text-[color:var(--legacy-accent-deep)]">
                        Access active until {formatWhen(d.grantExpiresAt)}
                        {d.grantedBy ? ` · ${d.grantedBy}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.status === "requested" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => act(d.id, "grant")}
                          disabled={busyId === d.id}
                          className="rounded-md bg-[color:var(--legacy-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
                        >
                          Grant now
                        </button>
                        <button
                          type="button"
                          onClick={() => act(d.id, "deny")}
                          disabled={busyId === d.id}
                          className="rounded-md border border-red-800/20 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                        >
                          Deny
                        </button>
                      </>
                    ) : null}
                    {d.status === "designated" ? (
                      <button
                        type="button"
                        onClick={() => act(d.id, "grant")}
                        disabled={busyId === d.id}
                        className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)]"
                      >
                        Pre-grant
                      </button>
                    ) : null}
                    {d.status === "denied" ||
                    d.status === "expired" ||
                    d.status === "granted" ? (
                      <button
                        type="button"
                        onClick={() => act(d.id, "reset")}
                        disabled={busyId === d.id}
                        className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)]"
                      >
                        {d.status === "granted" ? "Revoke access" : "Reset"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => startEdit(d)}
                      disabled={busyId === d.id}
                      title={
                        canEditDesignation(d.status)
                          ? "Edit contact"
                          : d.status === "granted"
                            ? "Revoke access before editing"
                            : "Deny the request before editing"
                      }
                      className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                      aria-label={`Edit ${d.designateeName}`}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => act(d.id, "delete")}
                      disabled={busyId === d.id}
                      className="rounded-md border border-red-800/20 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                      aria-label={`Remove ${d.designateeName}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-[color:var(--legacy-muted)]">
            No emergency contacts designated yet.
          </p>
        )}

        {formMode === null ? (
          <button
            type="button"
            onClick={startCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            <Plus className="size-4" aria-hidden />
            Designate trusted contact
          </button>
        ) : (
          <form
            onSubmit={saveDesignation}
            className="mt-5 space-y-3 border-t border-[color:var(--legacy-line)] pt-5"
          >
            <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
              {formMode === "edit"
                ? "Edit emergency contact"
                : "Designate trusted contact"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  Name
                </span>
                <input
                  value={draft.designateeName}
                  onChange={(e) =>
                    setDraft({ ...draft, designateeName: e.target.value })
                  }
                  required
                  maxLength={200}
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  Email
                </span>
                <input
                  type="email"
                  value={draft.designateeEmail}
                  onChange={(e) =>
                    setDraft({ ...draft, designateeEmail: e.target.value })
                  }
                  required
                  maxLength={320}
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  Relationship
                </span>
                <input
                  value={draft.relationship}
                  onChange={(e) =>
                    setDraft({ ...draft, relationship: e.target.value })
                  }
                  maxLength={200}
                  disabled={formBusy}
                  placeholder="Spouse, executor, attorney…"
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  Waiting period (hours)
                </span>
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={draft.waitingPeriodHours}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      waitingPeriodHours: Number(e.target.value),
                    })
                  }
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
                <span className="mt-1 block text-[11px] text-[color:var(--legacy-muted)]">
                  Use 0 for manual approval only
                </span>
              </label>
              <fieldset className="block sm:col-span-2">
                <legend className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  Access duration
                </legend>
                <div className="mt-2 space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 has-[:checked]:border-[color:var(--legacy-accent)] has-[:checked]:bg-[color:var(--legacy-accent-soft)]">
                    <input
                      type="radio"
                      name="accessType"
                      value="temporary"
                      checked={draft.accessType === "temporary"}
                      onChange={() =>
                        setDraft({ ...draft, accessType: "temporary" })
                      }
                      disabled={formBusy}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[color:var(--legacy-ink)]">
                        365 days
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[color:var(--legacy-muted)]">
                        Temporary access that expires one year after it is
                        granted. Best for most trusted contacts.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 has-[:checked]:border-[color:var(--legacy-accent)] has-[:checked]:bg-[color:var(--legacy-accent-soft)]">
                    <input
                      type="radio"
                      name="accessType"
                      value="permanent"
                      checked={draft.accessType === "permanent"}
                      onChange={() =>
                        setDraft({ ...draft, accessType: "permanent" })
                      }
                      disabled={formBusy}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[color:var(--legacy-ink)]">
                        Permanent Access
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[color:var(--legacy-muted)]">
                        Powerful — intended for trusted immediate family.
                        Access does not expire until you revoke it. Break-glass
                        rules and authentication still apply.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={formBusy}
                className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
              >
                {formBusy
                  ? "Saving…"
                  : formMode === "edit"
                    ? "Save changes"
                    : "Save designation"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={formBusy}
                className="inline-flex rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-muted)]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
