"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { celebrateFromJourney } from "@/lib/celebrations/bus";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

type DocOption = { id: string; title: string };

type PlanningItem = {
  id: string;
  categoryId: string;
  title: string;
  institution: string | null;
  accountHint: string | null;
  locationHint: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  sensitivity: "owner_only" | "emergency_ok";
  lastVerifiedAt: string | null;
  attachedDocuments: DocOption[];
  filled: boolean;
};

type CategoryCard = {
  id: string;
  title: string;
  description: string;
  weight: number;
  suggestedTitle: string;
  fieldsHint: string;
  vaultHref?: string;
  vaultLabel?: string;
  defaultSensitivity: "owner_only" | "emergency_ok";
  completed: boolean;
  hasDocuments: boolean;
  items: PlanningItem[];
};

type Board = {
  score: {
    completenessPercent: number;
    strengthPercent: number;
    documentationPercent: number;
    nextCategoryId: string | null;
  };
  categories: CategoryCard[];
};

type Draft = {
  title: string;
  institution: string;
  accountHint: string;
  locationHint: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  sensitivity: "owner_only" | "emergency_ok";
  documentIds: string[];
};

function emptyDraft(category: CategoryCard): Draft {
  return {
    title: category.suggestedTitle,
    institution: "",
    accountHint: "",
    locationHint: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    notes: "",
    sensitivity: category.defaultSensitivity,
    documentIds: [],
  };
}

export function LegacyPlanningBoard({
  initialBoard,
  documentOptions,
}: {
  initialBoard: Board;
  documentOptions: DocOption[];
}) {
  const t = useTranslations();
  const [board, setBoard] = useState(initialBoard);
  const [openId, setOpenId] = useState<string | null>(
    initialBoard.score.nextCategoryId,
  );
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextCategory = useMemo(
    () =>
      board.categories.find((c) => c.id === board.score.nextCategoryId) ??
      board.categories.find((c) => !c.completed) ??
      null,
    [board],
  );

  async function mutate(
    key: string,
    action: () => Promise<{
      board?: Board;
      celebration?: JourneyCelebrationPayload | null;
    }>,
  ) {
    setBusy(key);
    setError(null);
    try {
      const data = await action();
      if (data.board) setBoard(data.board);
      if (data.celebration) {
        celebrateFromJourney(data.celebration);
        window.dispatchEvent(new Event("fmv-journey-check"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("toasts.somethingWrong"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="ui-card ui-card-elevated flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <StrengthRing percent={board.score.strengthPercent} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-deep">
            {t("legacy.strengthTitle")}
          </p>
          <h1 className="font-display mt-1 text-2xl tracking-tight text-ink">
            {t("legacy.planHeading")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {t("legacy.planLead")}
          </p>
          <p className="mt-3 text-sm text-ink">
            {t("legacy.strengthBreakdown", {
              complete: board.score.completenessPercent,
              docs: board.score.documentationPercent,
            })}
          </p>
          {nextCategory ? (
            <p className="mt-2 text-sm text-ink-muted">
              {t("legacy.recommendNext", {
                name: categoryLabel(t, nextCategory.id, nextCategory.title),
              })}
            </p>
          ) : (
            <p className="mt-2 text-sm text-accent-deep">
              {t("legacy.strengthComplete")}
            </p>
          )}
        </div>
      </section>

      <div className="space-y-3">
        {board.categories.map((category) => {
          const open = openId === category.id;
          return (
            <article
              key={category.id}
              className={cn(
                "rounded-2xl border bg-canvas/80",
                category.completed
                  ? "border-accent/25"
                  : "border-ink/10",
              )}
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
                onClick={() =>
                  setOpenId(open ? null : category.id)
                }
                aria-expanded={open}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    category.completed
                      ? "bg-accent text-accent-foreground"
                      : "border border-ink/15 text-ink-muted",
                  )}
                  aria-hidden
                >
                  {category.completed ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="text-[10px] font-semibold">
                      {category.weight}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {categoryLabel(t, category.id, category.title)}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {categoryDescription(t, category.id, category.description)}
                    {category.hasDocuments
                      ? ` · ${t("legacy.hasDocuments")}`
                      : ""}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "mt-1 size-4 shrink-0 text-ink-muted transition",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {open ? (
                <div className="space-y-4 border-t border-ink/8 px-4 py-4 sm:px-5">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {category.fieldsHint}
                  </p>
                  {category.vaultHref ? (
                    <Link
                      href={category.vaultHref}
                      className="inline-flex text-xs font-medium text-accent-deep hover:underline"
                    >
                      {category.vaultLabel ?? t("legacy.openVaultSection")}
                    </Link>
                  ) : null}

                  {category.items.map((item) =>
                    editingId === item.id && draft ? (
                      <ItemForm
                        key={item.id}
                        draft={draft}
                        documentOptions={documentOptions}
                        busy={busy === item.id}
                        onChange={setDraft}
                        onCancel={() => {
                          setEditingId(null);
                          setDraft(null);
                        }}
                        onSave={() =>
                          void mutate(item.id, async () => {
                            const res = await fetch(
                              `/api/legacy/planning/${item.id}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(draft),
                              },
                            );
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(data.error || "Could not save.");
                            }
                            setEditingId(null);
                            setDraft(null);
                            return data;
                          })
                        }
                      />
                    ) : (
                      <ItemRow
                        key={item.id}
                        item={item}
                        busy={busy === item.id}
                        onEdit={() => {
                          setAddingFor(null);
                          setEditingId(item.id);
                          setDraft({
                            title: item.title,
                            institution: item.institution ?? "",
                            accountHint: item.accountHint ?? "",
                            locationHint: item.locationHint ?? "",
                            contactName: item.contactName ?? "",
                            contactPhone: item.contactPhone ?? "",
                            contactEmail: item.contactEmail ?? "",
                            notes: item.notes ?? "",
                            sensitivity: item.sensitivity,
                            documentIds: item.attachedDocuments.map((d) => d.id),
                          });
                        }}
                        onVerify={() =>
                          void mutate(item.id, async () => {
                            const res = await fetch(
                              `/api/legacy/planning/${item.id}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ verify: true }),
                              },
                            );
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(data.error || "Could not verify.");
                            }
                            return data;
                          })
                        }
                        onDelete={() =>
                          void mutate(item.id, async () => {
                            const res = await fetch(
                              `/api/legacy/planning/${item.id}`,
                              { method: "DELETE" },
                            );
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(data.error || "Could not delete.");
                            }
                            return data;
                          })
                        }
                      />
                    ),
                  )}

                  {addingFor === category.id && draft ? (
                    <ItemForm
                      draft={draft}
                      documentOptions={documentOptions}
                      busy={busy === `add-${category.id}`}
                      onChange={setDraft}
                      onCancel={() => {
                        setAddingFor(null);
                        setDraft(null);
                      }}
                      onSave={() =>
                        void mutate(`add-${category.id}`, async () => {
                          const res = await fetch("/api/legacy/planning", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              categoryId: category.id,
                              ...draft,
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            throw new Error(data.error || "Could not add.");
                          }
                          setAddingFor(null);
                          setDraft(null);
                          return data;
                        })
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-deep"
                      onClick={() => {
                        setEditingId(null);
                        setAddingFor(category.id);
                        setDraft(emptyDraft(category));
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      {t("legacy.addItem")}
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        {t("legacy.planPrivacyNote")}{" "}
        <Link href="/documents/legacy" className="font-medium text-accent-deep hover:underline">
          {t("legacy.openFullVault")}
        </Link>
      </p>
    </div>
  );
}

function categoryLabel(
  t: (key: string) => string,
  id: string,
  fallback: string,
) {
  const key = `legacy.cat.${id}.title`;
  const value = t(key);
  return value === key ? fallback : value;
}

function categoryDescription(
  t: (key: string) => string,
  id: string,
  fallback: string,
) {
  const key = `legacy.cat.${id}.description`;
  const value = t(key);
  return value === key ? fallback : value;
}

function StrengthRing({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  const ring = 2 * Math.PI * 36;
  const dash = ring * (1 - pct / 100);
  return (
    <span className="relative inline-flex size-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden>
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="color-mix(in srgb, var(--ink) 10%, transparent)"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={ring}
          strokeDashoffset={dash}
        />
      </svg>
      <span className="absolute text-lg font-semibold tabular-nums text-ink">
        {pct}%
      </span>
    </span>
  );
}

function ItemRow({
  item,
  busy,
  onEdit,
  onVerify,
  onDelete,
}: {
  item: PlanningItem;
  busy: boolean;
  onEdit: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const verified = item.lastVerifiedAt
    ? new Date(item.lastVerifiedAt).toLocaleDateString()
    : null;
  return (
    <div className="rounded-xl border border-ink/10 bg-canvas px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{item.title}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {[item.institution, item.accountHint ? `··${item.accountHint}` : null]
              .filter(Boolean)
              .join(" · ") || item.locationHint || item.contactName || t("legacy.itemStarted")}
          </p>
          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-ink-muted">
            <span>
              {item.sensitivity === "owner_only"
                ? t("legacy.accessOwnerOnly")
                : t("legacy.accessEmergencyOk")}
            </span>
            {verified ? <span>{t("legacy.lastVerified", { date: verified })}</span> : null}
            {item.attachedDocuments.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3" aria-hidden />
                {item.attachedDocuments.length}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="ui-btn ui-btn-ghost text-xs" onClick={onEdit}>
            {t("common.edit")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost text-xs"
            disabled={busy}
            onClick={onVerify}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : t("legacy.markVerified")}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-ink/10 px-2 py-1 text-xs text-ink-muted hover:border-red-300 hover:text-red-800"
            disabled={busy}
            onClick={onDelete}
            aria-label={t("common.delete")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemForm({
  draft,
  documentOptions,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  documentOptions: DocOption[];
  busy: boolean;
  onChange: (next: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations();
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="block text-xs font-medium text-ink">
        {t("legacy.fieldTitle")}
        <input
          required
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {t("legacy.fieldInstitution")}
          <input
            value={draft.institution}
            onChange={(e) => set("institution", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-ink">
          {t("legacy.fieldAccountHint")}
          <input
            value={draft.accountHint}
            onChange={(e) => set("accountHint", e.target.value)}
            maxLength={32}
            placeholder={t("legacy.fieldAccountHintPh")}
            className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-ink">
        {t("legacy.fieldLocation")}
        <input
          value={draft.locationHint}
          onChange={(e) => set("locationHint", e.target.value)}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {t("legacy.fieldContactName")}
          <input
            value={draft.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-ink">
          {t("legacy.fieldContactPhone")}
          <input
            value={draft.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-ink">
          {t("legacy.fieldContactEmail")}
          <input
            type="email"
            value={draft.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-ink">
        {t("legacy.fieldNotes")}
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-ink">
        {t("legacy.fieldAccess")}
        <select
          value={draft.sensitivity}
          onChange={(e) =>
            set("sensitivity", e.target.value as Draft["sensitivity"])
          }
          className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm"
        >
          <option value="emergency_ok">{t("legacy.accessEmergencyOk")}</option>
          <option value="owner_only">{t("legacy.accessOwnerOnly")}</option>
        </select>
      </label>
      <fieldset>
        <legend className="text-xs font-medium text-ink">
          {t("legacy.fieldDocuments")}
        </legend>
        <p className="mt-1 text-[11px] text-ink-muted">
          {t("legacy.fieldDocumentsHelp")}{" "}
          <Link href="/documents" className="text-accent-deep hover:underline">
            {t("nav.documents")}
          </Link>
        </p>
        {documentOptions.length === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">{t("legacy.noDocumentsYet")}</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md border border-ink/10 p-2">
            {documentOptions.map((doc) => {
              const checked = draft.documentIds.includes(doc.id);
              return (
                <li key={doc.id}>
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        set(
                          "documentIds",
                          checked
                            ? draft.documentIds.filter((id) => id !== doc.id)
                            : [...draft.documentIds, doc.id],
                        )
                      }
                    />
                    {doc.title}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
