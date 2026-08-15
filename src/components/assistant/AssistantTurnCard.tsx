"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CreditCard,
  Film,
  Images,
  Loader2,
  Pencil,
  Settings,
  Bot,
  Users,
  X,
} from "lucide-react";
import type {
  AssistantActionButtonView,
  AssistantTurnView,
  AssistantUnderstandingView,
} from "@/components/assistant/types";
import { formatMediaTypeCounts } from "@/lib/ai/media-preference";
import { useTranslations } from "@/components/i18n/LocaleProvider";

type AssistantTurnCardProps = {
  turn: AssistantTurnView;
  busy?: boolean;
  /** Hide dense “Understanding” chrome — better for the floating panel. */
  compact?: boolean;
  onConfirm?: (proposalId: string, selectedMediaIds?: string[]) => void;
  onCancel?: (proposalId: string) => void;
  onEdit?: () => void;
  onCreateMemoryFromSearch?: (mediaIds: string[]) => void;
  onCreateMovieFromSearch?: (mediaIds: string[]) => void;
  /**
   * Close the floating Ask AI panel when navigating away.
   * In-place actions (confirm, create-from-search) must NOT call this.
   */
  onNavigateAway?: () => void;
};

/**
 * Rich assistant turn: understanding, photo previews, confirm/edit/cancel.
 * Search / create previews support removing mismatched photos before create.
 */
export function AssistantTurnCard({
  turn,
  busy = false,
  compact = false,
  onConfirm,
  onCancel,
  onEdit,
  onCreateMemoryFromSearch,
  onCreateMovieFromSearch,
  onNavigateAway,
}: AssistantTurnCardProps) {
  const t = useTranslations();
  const router = useRouter();
  const showPreviewActions = turn.status === "preview" && turn.mediaPreview;
  const proposalId = turn.mediaPreview?.proposalId;
  const initialMediaIds = turn.mediaPreview?.mediaIds ?? turn.created.mediaIds;

  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(
    () => initialMediaIds,
  );

  // Reset selection when the turn’s media set changes (new search results).
  const mediaKey = initialMediaIds.join("|");
  useEffect(() => {
    setSelectedMediaIds(initialMediaIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mediaKey captures id list changes
  }, [mediaKey]);

  const removable =
    Boolean(turn.mediaPreview) &&
    (turn.status === "completed" || turn.status === "preview") &&
    (turn.mediaPreview?.action === "search_media" ||
      turn.mediaPreview?.action === "create_memory" ||
      turn.mediaPreview?.action === "create_movie" ||
      !turn.mediaPreview?.action);

  function removeMedia(mediaId: string) {
    setSelectedMediaIds((prev) => prev.filter((id) => id !== mediaId));
  }

  function restoreAll() {
    setSelectedMediaIds(initialMediaIds);
  }

  /** Close floating chat (if any), then navigate — no orphaned overlay. */
  function navigateAway(href: string) {
    const path = href.trim();
    if (!path || path === "#") return;
    onNavigateAway?.();
    if (path.startsWith("http://") || path.startsWith("https://")) {
      try {
        const url = new URL(path);
        router.push(`${url.pathname}${url.search}${url.hash}`);
      } catch {
        window.location.href = path;
      }
      return;
    }
    router.push(path);
  }

  function onNavLinkClick(href: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      navigateAway(href);
    };
  }

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {turn.assistantText}
      </p>

      {turn.understanding && !compact ? (
        <UnderstandingPanel understanding={turn.understanding} />
      ) : null}

      {turn.clarifyingQuestions.length > 0 && turn.status === "clarify" ? (
        <ul className="assistant-clarify space-y-1.5 rounded-lg border border-ink/10 bg-canvas-deep/50 px-3 py-3 text-sm text-ink-muted">
          {turn.clarifyingQuestions.map((question) => (
            <li key={question} className="flex gap-2">
              <span className="text-accent" aria-hidden>
                •
              </span>
              <span>{question}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {turn.mediaPreview ? (
        <MediaPreviewStrip
          preview={turn.mediaPreview}
          selectedMediaIds={selectedMediaIds}
          removable={removable}
          onRemove={removeMedia}
          onNavLinkClick={onNavLinkClick}
          onRestoreAll={
            selectedMediaIds.length < initialMediaIds.length
              ? restoreAll
              : undefined
          }
        />
      ) : null}

      {showPreviewActions && proposalId ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || selectedMediaIds.length === 0}
            onClick={() => onConfirm?.(proposalId, selectedMediaIds)}
            className="ui-btn ui-btn-primary ui-btn-sm"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {t("assistant.confirm")}
            {selectedMediaIds.length > 0 &&
            selectedMediaIds.length !== initialMediaIds.length
              ? ` (${selectedMediaIds.length})`
              : ""}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit?.()}
            className="ui-btn ui-btn-secondary ui-btn-sm"
          >
            <Pencil className="size-3.5" aria-hidden />
            {t("assistant.edit")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel?.(proposalId)}
            className="ui-btn ui-btn-ghost ui-btn-sm"
          >
            <X className="size-3.5" aria-hidden />
            {t("assistant.cancel")}
          </button>
        </div>
      ) : null}

      {turn.status === "completed" ? (
        <CreatedLinks
          turn={turn}
          buttons={turn.actionButtons}
          busy={busy}
          selectedMediaIds={selectedMediaIds}
          onCreateMemoryFromSearch={onCreateMemoryFromSearch}
          onCreateMovieFromSearch={onCreateMovieFromSearch}
          onNavLinkClick={onNavLinkClick}
        />
      ) : null}
    </div>
  );
}

function UnderstandingPanel({
  understanding,
}: {
  understanding: AssistantUnderstandingView;
}) {
  const t = useTranslations();
  const actionLabel = formatAction(understanding.action);
  const bits: string[] = [];
  if (understanding.people.length) {
    bits.push(understanding.people.join(", "));
  }
  if (understanding.dateRange?.label) {
    bits.push(understanding.dateRange.label);
  }
  if (understanding.tone) {
    bits.push(t("assistant.toneBit", { tone: understanding.tone }));
  }
  if (understanding.qualities?.length) {
    bits.push(understanding.qualities.join(" · "));
  }
  if (understanding.visualQuery) {
    bits.push(t("assistant.lookingFor", { query: understanding.visualQuery }));
  } else {
    if (understanding.objects?.length) {
      bits.push(
        t("assistant.objects", { list: understanding.objects.join(", ") }),
      );
    }
    if (understanding.scenes?.length) {
      bits.push(
        t("assistant.scenes", { list: understanding.scenes.join(", ") }),
      );
    }
  }
  if (understanding.themePreference) {
    bits.push(
      t("assistant.themeBit", { theme: understanding.themePreference }),
    );
  }
  if (understanding.documentCategory) {
    bits.push(
      t("assistant.categoryBit", { name: understanding.documentCategory }),
    );
  }
  if (understanding.documentTitle) {
    bits.push(
      t("assistant.documentBit", { name: understanding.documentTitle }),
    );
  }
  if (understanding.legacyContactName) {
    bits.push(
      t("assistant.contactBit", { name: understanding.legacyContactName }),
    );
  }
  if (understanding.legacyContactCategory) {
    bits.push(understanding.legacyContactCategory.replace(/_/g, " "));
  }
  if (understanding.legacyInstructionTitle) {
    bits.push(
      t("assistant.draftBit", { title: understanding.legacyInstructionTitle }),
    );
  }

  return (
    <div className="rounded-lg border border-accent/20 bg-accent/8 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-deep">
        <Bot className="size-3" aria-hidden />
        {t("assistant.understanding")}
      </p>
      <p className="mt-1 text-sm text-ink">
        <span className="font-medium">{actionLabel}</span>
        {bits.length > 0 ? (
          <span className="text-ink-muted"> — {bits.join(" · ")}</span>
        ) : null}
      </p>
      {understanding.titleSuggestion ? (
        <p className="mt-1 text-xs text-ink-muted">
          {t("assistant.workingTitle", {
            title: understanding.titleSuggestion,
          })}
        </p>
      ) : null}
    </div>
  );
}

function MediaPreviewStrip({
  preview,
  selectedMediaIds,
  removable,
  onRemove,
  onRestoreAll,
  onNavLinkClick,
}: {
  preview: NonNullable<AssistantTurnView["mediaPreview"]>;
  selectedMediaIds: string[];
  removable: boolean;
  onRemove: (mediaId: string) => void;
  onRestoreAll?: () => void;
  onNavLinkClick: (href: string) => (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const t = useTranslations();
  const selectedSet = new Set(selectedMediaIds);

  if (
    preview.action &&
    preview.action !== "create_movie" &&
    preview.action !== "create_memory" &&
    preview.action !== "search_media"
  ) {
    return (
      <div className="rounded-lg border border-ink/10 bg-canvas px-3 py-3">
        <p className="text-sm font-medium text-ink">
          {preview.title ?? formatAction(preview.action)}
        </p>
        {preview.summary ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {preview.summary}
          </p>
        ) : null}
      </div>
    );
  }

  const thumbs = preview.thumbnails.filter(
    (thumb) => thumb.previewUrl && selectedSet.has(thumb.mediaId),
  );
  const removedCount = Math.max(
    0,
    preview.mediaIds.length - selectedMediaIds.length,
  );
  const viewHref = preview.people[0]
    ? `/people/${preview.people[0].id}`
    : "/media";

  return (
    <div className="rounded-lg border border-ink/10 bg-canvas px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          {thumbs.length > 0
            ? formatMediaTypeCounts(thumbs.map((thumb) => ({ type: thumb.type })))
            : `${selectedMediaIds.length} item${
                selectedMediaIds.length === 1 ? "" : "s"
              }`}
          {removedCount > 0 ? (
            <span className="font-normal text-ink-muted">
              {" "}
              {t("assistant.selected")}
              {preview.totalCount > selectedMediaIds.length
                ? ` · ${t("assistant.removed", { count: removedCount })}`
                : ""}
            </span>
          ) : preview.totalCount > selectedMediaIds.length ? (
            <span className="font-normal text-ink-muted">
              {" "}
              {t("assistant.ofMatches", { count: preview.totalCount })}
            </span>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {onRestoreAll ? (
            <button
              type="button"
              onClick={onRestoreAll}
              className="text-xs font-medium text-accent transition hover:text-accent-deep"
            >
              {t("assistant.restoreAll")}
            </button>
          ) : null}
          {preview.title ? (
            <p className="truncate text-xs text-ink-muted">{preview.title}</p>
          ) : (
            <Link
              href={viewHref}
              onClick={onNavLinkClick(viewHref)}
              className="text-xs font-medium text-accent transition hover:text-accent-deep"
            >
              {t("assistant.open")}
            </Link>
          )}
        </div>
      </div>
      {removable && thumbs.length > 0 ? (
        <p className="mt-1 text-xs text-ink-muted">
          {t("assistant.removeMismatchHint")}
        </p>
      ) : null}
      {thumbs.length > 0 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {thumbs.map((thumb) => (
            <div
              key={thumb.mediaId}
              className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-ink/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb.previewUrl!}
                alt=""
                className="size-16 object-cover"
              />
              {thumb.type === "video" ? (
                <span className="pointer-events-none absolute bottom-0.5 left-0.5 inline-flex items-center gap-0.5 rounded bg-ink/75 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-canvas">
                  <Film className="size-2.5" aria-hidden />
                  {t("assistant.video")}
                </span>
              ) : (
                <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-ink/60 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-canvas">
                  {t("assistant.photo")}
                </span>
              )}
              {removable ? (
                <button
                  type="button"
                  onClick={() => onRemove(thumb.mediaId)}
                  className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-ink/75 text-canvas shadow-sm transition hover:bg-ink"
                  aria-label={t("assistant.removeMediaAria", {
                    kind:
                      thumb.type === "video"
                        ? t("assistant.video")
                        : t("assistant.photo"),
                  })}
                  title={t("assistant.removeFromResults")}
                >
                  <X className="size-3" aria-hidden />
                </button>
              ) : (
                <Link
                  href={viewHref}
                  onClick={onNavLinkClick(viewHref)}
                  className="absolute inset-0"
                  aria-label={t("assistant.openMediaLibrary")}
                />
              )}
            </div>
          ))}
        </div>
      ) : selectedMediaIds.length === 0 ? (
        <p className="mt-2 text-xs text-ink-muted">
          {t("assistant.allRemoved")}{" "}
          {onRestoreAll ? (
            <button
              type="button"
              onClick={onRestoreAll}
              className="font-medium text-accent hover:text-accent-deep"
            >
              {t("assistant.restoreAll")}
            </button>
          ) : (
            t("assistant.searchAgainPick")
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          {preview.people.length > 0 ? (
            <>
              {t("assistant.previewsNotReady")}{" "}
              <Link
                href={viewHref}
                onClick={onNavLinkClick(viewHref)}
                className="font-medium text-accent hover:text-accent-deep"
              >
                {t("assistant.openPersonsPhotos", {
                  name: preview.people[0]!.name,
                })}
              </Link>{" "}
              {t("assistant.toViewThem")}
            </>
          ) : (
            t("assistant.previewsWhenReady")
          )}
        </p>
      )}
    </div>
  );
}

function CreatedLinks({
  turn,
  buttons,
  busy = false,
  selectedMediaIds,
  onCreateMemoryFromSearch,
  onCreateMovieFromSearch,
  onNavLinkClick,
}: {
  turn: AssistantTurnView;
  buttons: AssistantActionButtonView[];
  busy?: boolean;
  selectedMediaIds: string[];
  onCreateMemoryFromSearch?: (mediaIds: string[]) => void;
  onCreateMovieFromSearch?: (mediaIds: string[]) => void;
  onNavLinkClick: (href: string) => (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const createMemoryBtn = buttons.find(
    (b) => b.action === "create_memory_from_search",
  );
  const createMovieBtn = buttons.find(
    (b) => b.action === "create_movie_from_search",
  );
  const navButtons = buttons.filter(
    (b) =>
      b.action === "view_memory" ||
      b.action === "view_movie" ||
      b.action === "browse_media" ||
      b.action === "open_documents" ||
      b.action === "open_legacy" ||
      b.action === "open_help_route",
  );

  if (
    !createMemoryBtn &&
    !createMovieBtn &&
    navButtons.length === 0 &&
    !turn.created.links.length
  ) {
    return null;
  }

  const createMediaIds = selectedMediaIds;

  return (
    <div className="flex flex-wrap gap-2">
      {createMemoryBtn && createMediaIds.length > 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreateMemoryFromSearch?.(createMediaIds)}
          className="ui-btn ui-btn-primary ui-btn-sm"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Images className="size-3.5" aria-hidden />
          )}
          {createMemoryBtn.label}
          {createMediaIds.length !== (createMemoryBtn.mediaIds?.length ?? 0)
            ? ` (${createMediaIds.length})`
            : ""}
        </button>
      ) : null}
      {createMovieBtn && createMediaIds.length > 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreateMovieFromSearch?.(createMediaIds)}
          className="ui-btn ui-btn-secondary ui-btn-sm"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Film className="size-3.5" aria-hidden />
          )}
          {createMovieBtn.label}
          {createMediaIds.length !== (createMovieBtn.mediaIds?.length ?? 0)
            ? ` (${createMediaIds.length})`
            : ""}
        </button>
      ) : null}
      {navButtons.map((button) => {
        const href = button.href ?? "#";
        const Icon = navIconForButton(button);
        return (
          <Link
            key={button.id}
            href={href}
            onClick={onNavLinkClick(href)}
            className="ui-btn ui-btn-secondary ui-btn-sm"
          >
            <Icon className="size-3.5 text-accent" aria-hidden />
            {button.label}
          </Link>
        );
      })}
      {navButtons.length === 0 && !createMemoryBtn && !createMovieBtn
        ? turn.created.links.map((link) => {
            const Icon = navIconForHref(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavLinkClick(link.href)}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                <Icon className="size-3.5 text-accent" aria-hidden />
                {link.label}
              </Link>
            );
          })
        : null}
    </div>
  );
}

function navIconForHref(href: string) {
  if (/\/family/i.test(href)) return Users;
  if (/\/billing|\/pricing/i.test(href)) return CreditCard;
  if (/\/settings/i.test(href)) return Settings;
  if (/\/movies/i.test(href)) return Film;
  return Images;
}

function navIconForButton(button: AssistantActionButtonView) {
  if (button.action === "view_movie") return Film;
  if (button.href) return navIconForHref(button.href);
  return Images;
}

function formatAction(action: string): string {
  switch (action) {
    case "create_movie":
      return "Create slideshow";
    case "create_memory":
      return "Create memory";
    case "search_media":
      return "Search media";
    case "clarify":
      return "Needs a bit more detail";
    case "create_document_category":
      return "Create document category";
    case "file_private_document":
      return "File private document";
    case "add_legacy_contact":
      return "Add legacy contact";
    case "draft_legacy_business":
      return "Draft business instructions";
    case "review_legacy_checklist":
      return "Review legacy checklist";
    case "answer_help":
      return "Product help";
    default:
      return action;
  }
}
