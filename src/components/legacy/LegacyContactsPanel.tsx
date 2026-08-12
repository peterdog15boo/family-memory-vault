"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedLegacyContact } from "@/lib/legacy/serialize";
import {
  LEGACY_CONTACT_CATEGORY_LABELS,
  type LegacyContactCategory,
} from "@/lib/legacy/types";
import { cn } from "@/lib/utils";

type LegacyContactsPanelProps = {
  contacts: SerializedLegacyContact[];
};

type ContactDraft = {
  name: string;
  relationship: string;
  category: LegacyContactCategory;
  phone: string;
  email: string;
  notes: string;
  isPrimary: boolean;
};

const CONTACT_CATEGORIES = Object.keys(
  LEGACY_CONTACT_CATEGORY_LABELS,
) as LegacyContactCategory[];

const EMPTY_DRAFT: ContactDraft = {
  name: "",
  relationship: "",
  category: "other",
  phone: "",
  email: "",
  notes: "",
  isPrimary: false,
};

export function LegacyContactsPanel({ contacts: initial }: LegacyContactsPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const [contacts, setContacts] = useState(initial);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...contacts].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [contacts],
  );

  async function createContact(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/legacy/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          relationship: draft.relationship.trim() || null,
          category: draft.category,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          notes: draft.notes.trim() || null,
          isPrimary: draft.isPrimary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("legacy.errorAddContact"));
      setContacts((prev) => [...prev, data.contact]);
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("legacy.errorAddContact"),
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function togglePrimary(contact: SerializedLegacyContact) {
    setBusyId(contact.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: !contact.isPrimary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("legacy.errorUpdateContact"));
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? data.contact : c)),
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("legacy.errorUpdateContact"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteContact(contact: SerializedLegacyContact) {
    if (
      !window.confirm(
        t("legacy.removeContactConfirm", { name: contact.name }),
      )
    ) {
      return;
    }
    setBusyId(contact.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("legacy.errorRemoveContact"));
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("legacy.errorRemoveContact"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {t("legacy.navContacts")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {t("legacy.contactsLead")}
        </p>

        {error ? (
          <p className="mt-4 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {sorted.length ? (
          <ul className="mt-5 space-y-3">
            {sorted.map((contact) => (
              <li
                key={contact.id}
                className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[color:var(--legacy-ink)]">
                        {contact.name}
                      </p>
                      {contact.isPrimary ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--legacy-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--legacy-accent-deep)]">
                          <Star className="size-3 fill-current" aria-hidden />
                          {t("legacy.primary")}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[color:var(--legacy-line)] px-2 py-0.5 text-[11px] text-[color:var(--legacy-muted)]">
                        {LEGACY_CONTACT_CATEGORY_LABELS[contact.category]}
                      </span>
                    </div>
                    {contact.relationship ? (
                      <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                        {contact.relationship}
                      </p>
                    ) : null}
                    <div className="mt-2 space-y-0.5 text-sm text-[color:var(--legacy-ink)]">
                      {contact.phone ? <p>{contact.phone}</p> : null}
                      {contact.email ? <p>{contact.email}</p> : null}
                    </div>
                    {contact.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                        {contact.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => togglePrimary(contact)}
                      disabled={busyId === contact.id}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
                        contact.isPrimary
                          ? "border-[color:var(--legacy-accent)]/30 bg-[color:var(--legacy-accent-soft)] text-[color:var(--legacy-accent-deep)]"
                          : "border-[color:var(--legacy-line)] text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)]",
                      )}
                    >
                      {contact.isPrimary
                        ? t("legacy.primaryContact")
                        : t("legacy.markPrimary")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteContact(contact)}
                      disabled={busyId === contact.id}
                      className="rounded-md border border-red-800/20 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                      aria-label={t("common.remove") + ` ${contact.name}`}
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
            {t("legacy.noContactsYet")}
          </p>
        )}

        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            <Plus className="size-4" aria-hidden />
            {t("legacy.addContact")}
          </button>
        ) : (
          <form onSubmit={createContact} className="mt-5 space-y-3 border-t border-[color:var(--legacy-line)] pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  {t("legacy.fieldName")}
                </span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                  maxLength={200}
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  {t("legacy.relationshipLabel")}
                </span>
                <input
                  value={draft.relationship}
                  onChange={(e) =>
                    setDraft({ ...draft, relationship: e.target.value })
                  }
                  maxLength={200}
                  disabled={formBusy}
                  placeholder={t("legacy.relationshipPlaceholder")}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  {t("legacy.fieldCategory")}
                </span>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as ContactDraft["category"],
                    })
                  }
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                >
                  {CONTACT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {LEGACY_CONTACT_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  {t("legacy.fieldContactPhone")}
                </span>
                <input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  maxLength={80}
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                  {t("legacy.fieldContactEmail")}
                </span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  maxLength={320}
                  disabled={formBusy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                {t("legacy.fieldNotes")}
              </span>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
                maxLength={4000}
                disabled={formBusy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--legacy-ink)]">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(e) =>
                  setDraft({ ...draft, isPrimary: e.target.checked })
                }
                disabled={formBusy}
                className="size-4 rounded border-[color:var(--legacy-line)]"
              />
              {t("legacy.markAsPrimary")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={formBusy}
                className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
              >
                {formBusy ? t("common.saving") : t("legacy.saveContact")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setDraft(EMPTY_DRAFT);
                }}
                disabled={formBusy}
                className="inline-flex rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-muted)]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
