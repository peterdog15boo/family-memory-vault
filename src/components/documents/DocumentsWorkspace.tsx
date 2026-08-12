"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Clock,
  FileText,
  FolderPlus,
  Heart,
  Lock,
  Plus,
  Search,
  Shield,
  Star,
} from "lucide-react";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { useCopy, useFormat, useTranslations } from "@/components/i18n/LocaleProvider";
import type {
  SerializedDocumentCategory,
  SerializedPrivateDocument,
} from "@/lib/documents/serialize";
import type { PrivateDocumentListView } from "@/lib/documents/types";
import {
  DOCUMENT_REMINDER_KIND_LABELS,
} from "@/lib/documents/types";
import { formatBytes } from "@/lib/billing/quotas";
import { cn } from "@/lib/utils";

type DocumentsWorkspaceProps = {
  categories: SerializedDocumentCategory[];
  documents: SerializedPrivateDocument[];
  selectedCategoryId: string | null;
  initialQuery: string;
  initialView: PrivateDocumentListView;
  r2Configured: boolean;
};

function contentTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.includes("word")) return "Word";
  if (contentType.includes("sheet") || contentType.includes("excel")) {
    return "Spreadsheet";
  }
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) {
    return "Presentation";
  }
  if (contentType === "text/plain") return "Text";
  return "File";
}

const VIEW_OPTION_IDS: {
  id: PrivateDocumentListView;
  icon: typeof Star;
}[] = [
  { id: "all", icon: FileText },
  { id: "important", icon: Star },
  { id: "recent", icon: Clock },
  { id: "reminders", icon: Bell },
];

export function DocumentsWorkspace({
  categories,
  documents,
  selectedCategoryId,
  initialQuery,
  initialView,
  r2Configured,
}: DocumentsWorkspaceProps) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const format = useFormat();
  const [query, setQuery] = useState(initialQuery);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const viewOptions = useMemo(
    () =>
      VIEW_OPTION_IDS.map((opt) => ({
        ...opt,
        label:
          opt.id === "all"
            ? t("documents.viewAll")
            : opt.id === "important"
              ? t("documents.viewImportant")
              : opt.id === "recent"
                ? t("documents.viewRecent")
                : t("documents.viewReminders"),
      })),
    [t],
  );

  const selected = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const totalCount = categories.reduce((sum, c) => sum + c.documentCount, 0);
  const selectedCount = selectedIds.size;

  function navigate(next: {
    categoryId?: string | null;
    query?: string;
    view?: PrivateDocumentListView;
  }) {
    const params = new URLSearchParams();
    const categoryId =
      next.categoryId === undefined ? selectedCategoryId : next.categoryId;
    const q = next.query === undefined ? query : next.query;
    const view = next.view === undefined ? initialView : next.view;
    if (categoryId) {
      const cat = categories.find((c) => c.id === categoryId);
      if (cat) params.set("category", cat.slug);
    }
    if (q.trim()) params.set("q", q.trim());
    if (view && view !== "all") params.set("view", view);
    const qs = params.toString();
    setSelectedIds(new Set());
    startTransition(() => {
      router.push(qs ? `/documents?${qs}` : "/documents");
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(documents.map((d) => d.id)));
  }

  async function runBulk(patch: {
    categoryId?: string;
    importantFlag?: boolean;
  }) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: [...selectedIds],
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("documents.errorBulkUpdate"));
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : t("documents.errorBulkUpdate"),
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function quickMoveOne(documentId: string, categoryId: string) {
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [documentId], categoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("documents.errorMove"));
      router.refresh();
    } catch (err) {
      setBulkError(
        err instanceof Error ? err.message : t("documents.errorMove"),
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      const res = await fetch("/api/documents/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("documents.errorCreateCategory"));
      setNewCategoryName("");
      router.refresh();
      if (data.category?.id) {
        navigate({ categoryId: data.category.id });
      }
    } catch (err) {
      setCategoryError(
        err instanceof Error
          ? err.message
          : t("documents.errorCreateCategory"),
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  const viewTitle =
    initialView === "important"
      ? t("documents.viewTitleImportant")
      : initialView === "recent"
        ? t("documents.viewTitleRecent")
        : initialView === "reminders"
          ? t("documents.viewTitleReminders")
          : (selected?.name ?? t("documents.allDocuments"));

  return (
    <>
      <AppPageIntro
        slot="documents"
        eyebrow={
          <>
            <Lock className="size-3.5" aria-hidden />
            {t("pages.documentsEyebrow")}
          </>
        }
        title={
          <>
            {t("pages.documentsTitle")}{" "}
            <HintTooltip
              tip={copy.tips.privateDocuments}
              label={t("pages.documentsAbout")}
            />
          </>
        }
        description={t("pages.documentsDescription")}
      />

      <div className="documents-vault app-page mx-auto max-w-6xl">
      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="documents-vault-panel documents-vault-in space-y-4 rounded-2xl p-3 lg:sticky lg:top-6 lg:self-start">
          <div>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--doc-muted)]">
              {t("pages.documentsCategories")}
            </p>
            <nav
              className="flex flex-col gap-0.5"
              aria-label={t("documents.categoriesAria")}
            >
              <button
                type="button"
                onClick={() => navigate({ categoryId: null })}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  !selectedCategoryId
                    ? "bg-[color:var(--doc-accent-soft)] font-medium text-[color:var(--doc-accent-deep)]"
                    : "text-[color:var(--doc-muted)] hover:bg-black/5 hover:text-[color:var(--doc-ink)]",
                )}
              >
                <span className="min-w-0 flex-1 break-words">
                  {t("documents.allDocuments")}
                </span>
                <span className="shrink-0 tabular-nums text-xs opacity-70">
                  {totalCount}
                </span>
              </button>
              {categories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => navigate({ categoryId: cat.id })}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "bg-[color:var(--doc-accent-soft)] font-medium text-[color:var(--doc-accent-deep)]"
                        : "text-[color:var(--doc-muted)] hover:bg-black/5 hover:text-[color:var(--doc-ink)]",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {cat.name}
                      {!cat.isDefault ? (
                        <span className="ml-1 text-[10px] font-normal uppercase tracking-wide opacity-60">
                          {t("documents.customBadge")}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs opacity-70">
                      {cat.documentCount}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <form
            onSubmit={createCategory}
            className="border-t border-[color:var(--doc-line)] px-1 pt-3"
          >
            <label className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--doc-muted)]">
              {t("documents.newCategory")}
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t("documents.newCategoryPlaceholder")}
                maxLength={120}
                disabled={categoryBusy}
                className="min-w-0 flex-1 rounded-md border border-[color:var(--doc-line)] bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              />
              <button
                type="submit"
                disabled={categoryBusy || !newCategoryName.trim()}
                className="inline-flex items-center rounded-md bg-[color:var(--doc-accent)] px-2.5 text-white hover:bg-[color:var(--doc-accent-deep)] disabled:opacity-40"
                aria-label={t("documents.addCategory")}
              >
                <FolderPlus className="size-4" />
              </button>
            </div>
            {categoryError ? (
              <p className="mt-1.5 px-1 text-xs text-red-800">{categoryError}</p>
            ) : null}
          </form>

          <div className="border-t border-[color:var(--doc-line)] px-1 pt-3">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--doc-muted)]">
              Planning
            </p>
            <Link
              href="/legacy"
              className="mt-1.5 flex items-start gap-2.5 rounded-lg px-2 py-2.5 text-sm text-[color:var(--doc-muted)] transition hover:bg-[color:var(--doc-accent-soft)] hover:text-[color:var(--doc-accent-deep)]"
            >
              <Heart className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="block font-medium text-[color:var(--doc-ink)]">
                  Legacy Plan
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed">
                  Guided checklist and Legacy Strength — plus the private vault
                  for messages and contacts.
                </span>
              </span>
            </Link>
            <Link
              href="/documents/legacy/emergency"
              className="mt-1.5 flex items-start gap-2.5 rounded-lg px-2 py-2.5 text-sm text-[color:var(--doc-muted)] transition hover:bg-[color:var(--doc-accent-soft)] hover:text-[color:var(--doc-accent-deep)]"
            >
              <Shield className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="block font-medium text-[color:var(--doc-ink)]">
                  Emergency Access
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed">
                  Choose trusted people and review what an authorized helper could
                  access.
                </span>
              </span>
            </Link>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="documents-vault-in flex flex-wrap gap-2">
            {viewOptions.map(({ id, label, icon: Icon }) => {
              const active = initialView === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate({ view: id })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "border-[color:var(--doc-accent)] bg-[color:var(--doc-accent-soft)] text-[color:var(--doc-accent-deep)]"
                      : "border-[color:var(--doc-line)] text-[color:var(--doc-muted)] hover:bg-black/5",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="documents-vault-in mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--doc-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ query });
                }}
                placeholder={t("documents.searchPlaceholder")}
                className="w-full rounded-lg border border-[color:var(--doc-line)] bg-[color:var(--doc-panel)] py-2.5 pl-10 pr-3 text-sm text-[color:var(--doc-ink)] outline-none ring-[color:var(--doc-accent)] placeholder:text-[color:var(--doc-muted)] focus:ring-2"
                aria-label={t("documents.searchAria")}
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => navigate({ query })}
                className="rounded-md border border-[color:var(--doc-line)] bg-[color:var(--doc-panel)] px-3 py-2.5 text-sm font-medium text-[color:var(--doc-ink)] transition hover:bg-[color:var(--doc-accent-soft)]"
              >
                {t("documents.search")}
              </button>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                disabled={!r2Configured}
                className="inline-flex items-center gap-2 rounded-md bg-[color:var(--doc-accent)] px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-[color:var(--doc-accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" aria-hidden />
                {t("common.upload")}
              </button>
            </div>
          </div>

          {!r2Configured ? (
            <p className="mt-3 rounded-lg border border-amber-700/20 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Object storage is not configured yet, so uploads are paused.
            </p>
          ) : null}

          {selectedCount > 0 ? (
            <div className="documents-vault-panel mt-4 flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[color:var(--doc-ink)]">
                {t("documents.selectedCount", { count: selectedCount })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-[color:var(--doc-muted)]">
                  <span className="sr-only">{t("documents.moveToCategory")}</span>
                  <select
                    disabled={bulkBusy}
                    defaultValue=""
                    onChange={(e) => {
                      const value = e.target.value;
                      e.target.value = "";
                      if (value) void runBulk({ categoryId: value });
                    }}
                    className="rounded-md border border-[color:var(--doc-line)] bg-white/80 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
                  >
                    <option value="" disabled>
                      {t("documents.moveTo")}
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulk({ importantFlag: true })}
                  className="rounded-md border border-[color:var(--doc-line)] px-2.5 py-1.5 text-sm hover:bg-[color:var(--doc-accent-soft)] disabled:opacity-50"
                >
                  {t("documents.markImportantBulk")}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulk({ importantFlag: false })}
                  className="rounded-md border border-[color:var(--doc-line)] px-2.5 py-1.5 text-sm hover:bg-[color:var(--doc-accent-soft)] disabled:opacity-50"
                >
                  {t("documents.clearImportant")}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => setSelectedIds(new Set())}
                  className="text-sm text-[color:var(--doc-muted)] hover:underline"
                >
                  {t("documents.clearSelection")}
                </button>
              </div>
            </div>
          ) : null}

          {bulkError ? (
            <p className="mt-3 rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
              {bulkError}
            </p>
          ) : null}

          <div className="mt-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl tracking-tight text-[color:var(--doc-ink)]">
                {viewTitle}
              </h2>
              <p className="text-xs text-[color:var(--doc-muted)]">
                {pending || bulkBusy
                  ? t("documents.updating")
                  : t("documents.shownCount", { count: documents.length })}
              </p>
            </div>

            {documents.length === 0 ? (
              <div className="documents-empty documents-vault-panel rounded-2xl px-6 py-14 text-center">
                <span className="documents-empty-icon mx-auto inline-flex">
                  <FileText
                    className="size-9 text-[color:var(--doc-muted)]/50"
                    aria-hidden
                  />
                </span>
                <p className="mt-4 font-display text-xl tracking-tight text-[color:var(--doc-ink)]">
                  {initialQuery.trim()
                    ? copy.empty.documentsSearch.title
                    : initialView === "reminders"
                      ? t("documents.emptyRemindersTitle")
                      : initialView === "important"
                        ? t("documents.emptyImportantTitle")
                        : initialView === "recent"
                          ? t("documents.emptyRecentTitle")
                          : copy.empty.documentsCategory.title}
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[color:var(--doc-muted)]">
                  {initialQuery.trim()
                    ? copy.empty.documentsSearch.description
                    : initialView === "reminders"
                      ? t("documents.emptyRemindersBody")
                      : initialView === "important"
                        ? t("documents.emptyImportantBody")
                        : initialView === "recent"
                          ? t("documents.emptyRecentBody")
                          : selected
                            ? t("empty.documentsFolderEmpty", {
                                name: selected.name,
                                description:
                                  copy.empty.documentsCategory.description,
                              })
                            : copy.empty.documentsCategory.description}
                </p>
                {initialView === "all" && !initialQuery.trim() ? (
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    disabled={!r2Configured}
                    className="mt-6 inline-flex items-center gap-2 rounded-md bg-[color:var(--doc-accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[color:var(--doc-accent-deep)] disabled:opacity-50"
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("documents.uploadDocument")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      navigate({ query: "", view: "all" });
                    }}
                    className="mt-6 text-sm font-medium text-[color:var(--doc-accent-deep)] hover:underline"
                  >
                    {t("documents.showAllDocuments")}
                  </button>
                )}
              </div>
            ) : (
              <div className="documents-vault-panel overflow-hidden rounded-2xl">
                <div className="flex items-center gap-3 border-b border-[color:var(--doc-line)] px-4 py-2 text-xs text-[color:var(--doc-muted)]">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={
                        documents.length > 0 &&
                        selectedIds.size === documents.length
                      }
                      onChange={toggleSelectAll}
                      className="size-3.5 rounded border-[color:var(--doc-line)]"
                    />
                    {t("documents.selectAll")}
                  </label>
                </div>
                <ul className="documents-list list-panel divide-y divide-[color:var(--doc-line)] overflow-hidden rounded-xl border border-[color:var(--doc-line)]">
                  {documents.map((doc) => {
                    const categoryName =
                      categories.find((c) => c.id === doc.categoryId)?.name ??
                      t("documents.uncategorized");
                    const reminderLabel = doc.reminderAt
                      ? format.date(doc.reminderAt)
                      : null;
                    const docDateLabel = doc.documentDate
                      ? format.date(doc.documentDate)
                      : null;
                    return (
                      <li
                        key={doc.id}
                        className={cn(
                          "documents-row flex items-stretch gap-0",
                          doc.reminderUrgency === "overdue" &&
                            "bg-red-50/70",
                          doc.reminderUrgency === "due_today" &&
                            "bg-amber-50/60",
                        )}
                      >
                        <div className="flex items-start px-3 py-3.5 sm:px-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelected(doc.id)}
                            className="mt-2.5 size-3.5 rounded border-[color:var(--doc-line)]"
                            aria-label={`Select ${doc.title}`}
                          />
                        </div>
                        <Link
                          href={`/documents/${doc.id}`}
                          className="flex min-w-0 flex-1 items-start gap-3 py-3.5 pr-3 transition hover:bg-[color:var(--doc-accent-soft)]/60 sm:gap-4 sm:pr-4"
                        >
                          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--doc-accent-soft)] text-[color:var(--doc-accent-deep)]">
                            <FileText className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-[color:var(--doc-ink)]">
                              {doc.title}
                              {doc.importantFlag ? (
                                <Star
                                  className="ml-1.5 inline size-3.5 fill-[color:var(--doc-accent)] text-[color:var(--doc-accent)]"
                                  aria-label={t("documents.importantAria")}
                                />
                              ) : null}
                            </span>
                            <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-[color:var(--doc-muted)]">
                              <span>{categoryName}</span>
                              <span aria-hidden>·</span>
                              <span>{contentTypeLabel(doc.contentType)}</span>
                              <span aria-hidden>·</span>
                              <span>{formatBytes(doc.sizeBytes, 0, format.locale)}</span>
                              <span aria-hidden>·</span>
                              <span>{format.date(doc.createdAt)}</span>
                              {docDateLabel ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>
                                    {t("documents.dated", { date: docDateLabel })}
                                  </span>
                                </>
                              ) : null}
                              {reminderLabel ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1",
                                      doc.reminderUrgency === "overdue"
                                        ? "font-medium text-red-800"
                                        : doc.reminderUrgency === "due_today"
                                          ? "font-medium text-amber-900"
                                          : "text-[color:var(--doc-accent-deep)]",
                                    )}
                                  >
                                    <Bell className="size-3" aria-hidden />
                                    {doc.reminderUrgency === "overdue"
                                      ? t("documents.overdue")
                                      : doc.reminderUrgency === "due_today"
                                        ? t("documents.dueToday")
                                        : null}
                                    {(doc.reminderUrgency === "overdue" ||
                                      doc.reminderUrgency === "due_today") &&
                                    (doc.reminderKind || reminderLabel)
                                      ? " · "
                                      : null}
                                    {doc.reminderKind
                                      ? DOCUMENT_REMINDER_KIND_LABELS[
                                          doc.reminderKind
                                        ]
                                      : null}
                                    {doc.reminderKind && reminderLabel
                                      ? " · "
                                      : null}
                                    {reminderLabel}
                                  </span>
                                </>
                              ) : null}
                            </span>
                            {doc.tags.length > 0 ? (
                              <span className="mt-1.5 flex flex-wrap gap-1.5">
                                {doc.tags.slice(0, 6).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded border border-[color:var(--doc-line)] px-1.5 py-0.5 text-[11px] text-[color:var(--doc-muted)]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                        <div className="hidden items-center pr-3 sm:flex">
                          <select
                            aria-label={`Move ${doc.title}`}
                            disabled={bulkBusy}
                            value={doc.categoryId}
                            onChange={(e) => {
                              e.preventDefault();
                              if (e.target.value !== doc.categoryId) {
                                void quickMoveOne(doc.id, e.target.value);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="max-w-[9rem] truncate rounded-md border border-[color:var(--doc-line)] bg-white/70 px-2 py-1 text-xs text-[color:var(--doc-muted)] outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <p className="mt-8 flex gap-2 text-xs leading-relaxed text-[color:var(--doc-muted)]">
            <Shield
              className="mt-0.5 size-3.5 shrink-0 text-[color:var(--doc-accent)]"
              aria-hidden
            />
            Access uses short-lived secure links. These files are isolated from
            Memories, Movies, and family sharing.
          </p>
        </section>
      </div>

      <DocumentUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        categories={categories}
        defaultCategoryId={selectedCategoryId ?? categories[0]?.id ?? ""}
        onUploaded={(documentId) => {
          setUploadOpen(false);
          router.push(`/documents/${documentId}`);
          router.refresh();
        }}
      />
      </div>
    </>
  );
}
