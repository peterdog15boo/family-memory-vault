"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import {
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Lightbulb,
  Loader2,
  X,
} from "lucide-react";
import { FeedbackScreenshotField } from "@/components/feedback/FeedbackScreenshotField";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { getBetaDiscordUrl } from "@/lib/beta-discord";
import { getBetaSurveyUrl } from "@/lib/beta-survey";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  categoryFromPathname,
  type FeedbackMode,
  type FeedbackSeverity,
} from "@/lib/feedback/categories";
import { collectFeedbackContext } from "@/lib/feedback/context";
import { formatFeedbackDebugText } from "@/lib/feedback/debug-text";
import type { FeedbackScreenshot } from "@/lib/feedback/screenshot";
import type { FeedbackHistoryItem } from "@/lib/feedback/submit";
import { cn } from "@/lib/utils";

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: FeedbackMode;
};

type FormState = {
  mode: FeedbackMode;
  title: string;
  description: string;
  expectedBehavior: string;
  severity: FeedbackSeverity;
  problemStatement: string;
  suggestedSolution: string;
  category: string;
};

const EMPTY: Omit<FormState, "mode" | "category" | "severity"> = {
  title: "",
  description: "",
  expectedBehavior: "",
  problemStatement: "",
  suggestedSolution: "",
};

/**
 * Lightweight beta feedback dialog — bug report or feature request.
 */
export function FeedbackModal({
  open,
  onClose,
  initialMode = "bug",
}: FeedbackModalProps) {
  const t = useTranslations();
  const pathname = usePathname() || "/";
  const { user } = useUser();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<FeedbackScreenshot | null>(null);
  const [hideForCapture, setHideForCapture] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<FeedbackHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);

  const suggestedCategory = useMemo(
    () => categoryFromPathname(pathname),
    [pathname],
  );

  const context = useMemo(() => {
    if (!open || typeof window === "undefined") return null;
    return collectFeedbackContext({
      pathname,
      userId: user?.id ?? null,
      email:
        user?.primaryEmailAddress?.emailAddress ??
        user?.emailAddresses?.[0]?.emailAddress ??
        null,
    });
  }, [open, pathname, user]);

  const [form, setForm] = useState<FormState>(() => ({
    mode: initialMode,
    category: suggestedCategory,
    severity: "medium",
    ...EMPTY,
  }));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setError(null);
    setDetailsOpen(false);
    setSubmitting(false);
    setTicketId(null);
    setScreenshot(null);
    setHideForCapture(false);
    setCopied(false);
    setCategoryTouched(false);
    const next = collectFeedbackContext({
      pathname,
      userId: user?.id ?? null,
      email:
        user?.primaryEmailAddress?.emailAddress ??
        user?.emailAddresses?.[0]?.emailAddress ??
        null,
    });
    setForm({
      mode: initialMode,
      category: next.category,
      severity: "medium",
      ...EMPTY,
    });
  }, [open, initialMode, pathname, user]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHistoryLoading(true);
    void fetch("/api/feedback")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { items?: FeedbackHistoryItem[] };
      })
      .then((data) => {
        if (cancelled) return;
        setHistory(Array.isArray(data?.items) ? data.items.slice(0, 5) : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, done]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useOverlayA11y({
    open,
    onClose,
    containerRef: dialogRef,
    escapeEnabled: !submitting && !hideForCapture,
    initialFocusSelector: "input:not([type='hidden']), textarea, select, button",
  });

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function copyDebugInfo() {
    if (!context) return;
    const text = formatFeedbackDebugText(context);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("feedback.copyDebugFailed"));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!context || submitting) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      type: form.mode,
      mode: form.mode,
      title: form.title.trim(),
      description: form.description.trim(),
      expectedBehavior:
        form.mode === "bug" ? form.expectedBehavior.trim() || null : null,
      severity: form.mode === "bug" ? form.severity : null,
      problemStatement:
        form.mode === "feature" ? form.problemStatement.trim() || null : null,
      suggestedSolution:
        form.mode === "feature" ? form.suggestedSolution.trim() || null : null,
      category: form.category,
      pathname: context.pathname,
      pageUrl: context.url,
      browser: context.browser,
      os: context.os,
      viewportWidth: context.viewportWidth,
      viewportHeight: context.viewportHeight,
      devicePixelRatio: context.devicePixelRatio,
      consoleErrors: context.consoleErrors,
      userAgent: context.userAgent,
      clientTimestamp: context.timestamp,
      email: context.email,
      screenshotDataUrl:
        form.mode === "bug" && screenshot ? screenshot.dataUrl : null,
    };

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        ticketId?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error || t("feedback.errorGeneric"));
        setSubmitting(false);
        return;
      }
      setTicketId(data?.ticketId ?? null);
      setDone(true);
      setSubmitting(false);
    } catch {
      setError(t("feedback.errorGeneric"));
      setSubmitting(false);
    }
  }

  if (!mounted || !open) return null;

  const surveyUrl = getBetaSurveyUrl();
  const discordUrl = getBetaDiscordUrl();
  const liveContext = context;

  return createPortal(
    <div
      data-feedback-modal
      className={cn(
        "ui-modal-backdrop z-[110]",
        hideForCapture && "pointer-events-none opacity-0",
      )}
      role="presentation"
      aria-hidden={hideForCapture || undefined}
      onMouseDown={(e) => {
        if (hideForCapture) return;
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-modal-panel flex max-h-[min(92vh,44rem)] flex-col overflow-hidden"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-ink-muted">
              {t("feedback.modalEyebrow")}
            </p>
            <h2
              id={titleId}
              className="mt-1 font-display text-xl tracking-tight text-ink sm:text-[1.35rem]"
            >
              {t("feedback.modalTitle")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {surveyUrl
                ? t("feedback.modalLeadWithSurvey")
                : t("feedback.modalLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || hideForCapture}
            className="shrink-0 rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            aria-label={t("feedback.closeAria")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <CheckCircle2
              className="size-10 text-accent-deep"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="space-y-1.5">
              <p className="font-display text-xl tracking-tight text-ink">
                {t("feedback.successTitle")}
              </p>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink-muted">
                {t("feedback.successThanksBeta")}
              </p>
            </div>
            {ticketId ? (
              <div className="w-full max-w-xs rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  {t("feedback.successTicketLabel")}
                </p>
                <p className="mt-1 font-mono text-base font-medium text-ink">
                  {ticketId}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                  {t("feedback.successTicketHint")}
                </p>
              </div>
            ) : null}
            <div className="mt-1 flex w-full max-w-sm flex-col items-stretch gap-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn-secondary ui-btn-sm inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <DiscordIcon className="size-4 text-[#5865F2]" />
                {t("feedback.discordCta")}
                <ExternalLink className="size-3 opacity-70" aria-hidden />
                <span className="sr-only">{t("feedback.discordOpensNew")}</span>
              </a>
              {surveyUrl ? (
                <a
                  href={surveyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn-secondary ui-btn-sm inline-flex w-full items-center justify-center gap-1.5 sm:w-auto"
                >
                  <ClipboardList className="size-3.5" aria-hidden />
                  {t("feedback.surveyCta")}
                  <ExternalLink className="size-3 opacity-70" aria-hidden />
                </a>
              ) : null}
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm w-full sm:w-auto"
                onClick={onClose}
              >
                {t("feedback.done")}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div
                className="grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.04] p-1"
                role="tablist"
                aria-label={t("feedback.modeAria")}
              >
                {(
                  [
                    { id: "bug", icon: Bug, label: t("feedback.modeBug") },
                    {
                      id: "feature",
                      icon: Lightbulb,
                      label: t("feedback.modeFeature"),
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = form.mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setField("mode", tab.id);
                        if (tab.id !== "bug") setScreenshot(null);
                      }}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-canvas text-ink shadow-sm"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor="feedback-title">
                  {t("feedback.fieldTitle")}
                </label>
                <input
                  id="feedback-title"
                  className="ui-input"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  maxLength={160}
                  required
                  autoFocus
                  placeholder={
                    form.mode === "bug"
                      ? t("feedback.titlePlaceholderBug")
                      : t("feedback.titlePlaceholderFeature")
                  }
                />
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor="feedback-description">
                  {form.mode === "bug"
                    ? t("feedback.fieldWhatHappened")
                    : t("feedback.fieldDescription")}
                </label>
                <textarea
                  id="feedback-description"
                  className="ui-input min-h-[5.5rem] resize-y"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  maxLength={8000}
                  required
                  placeholder={
                    form.mode === "bug"
                      ? t("feedback.descPlaceholderBug")
                      : t("feedback.descPlaceholderFeature")
                  }
                />
              </div>

              {form.mode === "bug" ? (
                <>
                  <div className="ui-field">
                    <label
                      className="ui-label"
                      htmlFor="feedback-expected"
                    >
                      {t("feedback.fieldExpected")}
                    </label>
                    <textarea
                      id="feedback-expected"
                      className="ui-input min-h-[4rem] resize-y"
                      value={form.expectedBehavior}
                      onChange={(e) =>
                        setField("expectedBehavior", e.target.value)
                      }
                      maxLength={4000}
                      placeholder={t("feedback.expectedPlaceholder")}
                    />
                  </div>
                  <div className="ui-field">
                    <span className="ui-label">{t("feedback.fieldSeverity")}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {FEEDBACK_SEVERITIES.map((level) => {
                        const active = form.severity === level;
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setField("severity", level)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                              active
                                ? "border-accent/40 bg-accent/10 text-accent-deep"
                                : "border-ink/10 text-ink-muted hover:border-ink/20 hover:text-ink",
                            )}
                          >
                            {t(`feedback.severity.${level}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <FeedbackScreenshotField
                    value={screenshot}
                    onChange={setScreenshot}
                    disabled={submitting}
                    onBeforeCapture={async () => setHideForCapture(true)}
                    onAfterCapture={async () => setHideForCapture(false)}
                  />

                  <div className="ui-field">
                    <label
                      className="ui-label"
                      htmlFor="feedback-category-bug"
                    >
                      {t("feedback.fieldCategory")}
                    </label>
                    <select
                      id="feedback-category-bug"
                      className="ui-input"
                      value={form.category}
                      onChange={(e) => {
                        setCategoryTouched(true);
                        setField("category", e.target.value);
                      }}
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {!categoryTouched &&
                    form.category === suggestedCategory ? (
                      <p className="ui-hint mt-1">
                        {t("feedback.categoryFromPage", {
                          category: suggestedCategory,
                        })}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="ui-field">
                    <label
                      className="ui-label"
                      htmlFor="feedback-problem"
                    >
                      {t("feedback.fieldProblem")}
                    </label>
                    <textarea
                      id="feedback-problem"
                      className="ui-input min-h-[4rem] resize-y"
                      value={form.problemStatement}
                      onChange={(e) =>
                        setField("problemStatement", e.target.value)
                      }
                      maxLength={4000}
                      required
                      placeholder={t("feedback.problemPlaceholder")}
                    />
                  </div>
                  <div className="ui-field">
                    <label
                      className="ui-label"
                      htmlFor="feedback-solution"
                    >
                      {t("feedback.fieldSolution")}
                      <span className="ml-1 font-normal text-ink-muted">
                        ({t("feedback.optional")})
                      </span>
                    </label>
                    <textarea
                      id="feedback-solution"
                      className="ui-input min-h-[3.5rem] resize-y"
                      value={form.suggestedSolution}
                      onChange={(e) =>
                        setField("suggestedSolution", e.target.value)
                      }
                      maxLength={4000}
                      placeholder={t("feedback.solutionPlaceholder")}
                    />
                  </div>
                  <div className="ui-field">
                    <label
                      className="ui-label"
                      htmlFor="feedback-category"
                    >
                      {t("feedback.fieldCategory")}
                    </label>
                    <select
                      id="feedback-category"
                      className="ui-input"
                      value={form.category}
                      onChange={(e) => {
                        setCategoryTouched(true);
                        setField("category", e.target.value);
                      }}
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {!categoryTouched &&
                    form.category === suggestedCategory ? (
                      <p className="ui-hint mt-1">
                        {t("feedback.categoryFromPage", {
                          category: suggestedCategory,
                        })}
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              {(historyLoading || history.length > 0) && (
                <div className="rounded-xl border border-ink/8 bg-ink/[0.02] px-3.5 py-3">
                  <p className="text-xs font-medium text-ink">
                    {t("feedback.historyTitle")}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-ink-muted">
                    {t("feedback.historyLead")}
                  </p>
                  {historyLoading && history.length === 0 ? (
                    <p className="mt-2 text-xs text-ink-muted">
                      {t("feedback.historyLoading")}
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2" aria-label={t("feedback.historyAria")}>
                      {history.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {item.title}
                            </p>
                            <p className="mt-0.5 font-mono text-[0.65rem] text-ink-muted">
                              {item.ticketId}
                              <span className="mx-1 text-ink/30">·</span>
                              {item.mode === "feature"
                                ? t("feedback.modeFeature")
                                : t("feedback.modeBug")}
                            </p>
                          </div>
                          <StatusPill status={item.status} t={t} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-ink/8 bg-ink/[0.02]">
                <div className="flex items-center gap-2 px-3.5 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left text-xs font-medium text-ink-muted transition hover:text-ink"
                    onClick={() => setDetailsOpen((v) => !v)}
                    aria-expanded={detailsOpen}
                  >
                    {t("feedback.techDetails")}
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 transition-transform",
                        detailsOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={copyDebugInfo}
                    aria-label={t("feedback.copyDebugAria")}
                  >
                    {copied ? (
                      <Check className="size-3.5 text-accent-deep" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                    {copied
                      ? t("feedback.copyDebugDone")
                      : t("feedback.copyDebug")}
                  </button>
                </div>
                {detailsOpen && liveContext ? (
                  <dl className="space-y-1.5 border-t border-ink/8 px-3.5 py-3 font-mono text-[0.7rem] leading-relaxed text-ink-muted">
                    <DetailRow
                      label={t("feedback.techUrl")}
                      value={liveContext.url}
                    />
                    <DetailRow
                      label={t("feedback.techPath")}
                      value={liveContext.pathname}
                    />
                    <DetailRow
                      label={t("feedback.techCategory")}
                      value={liveContext.category}
                    />
                    <DetailRow
                      label={t("feedback.techBrowser")}
                      value={`${liveContext.browser} · ${liveContext.os}`}
                    />
                    <DetailRow
                      label={t("feedback.techViewport")}
                      value={`${liveContext.viewportWidth}×${liveContext.viewportHeight} @${liveContext.devicePixelRatio}x`}
                    />
                    <DetailRow
                      label={t("feedback.techUser")}
                      value={
                        liveContext.userId
                          ? `${liveContext.userId}${liveContext.email ? ` · ${liveContext.email}` : ""}`
                          : t("feedback.techSignedOut")
                      }
                    />
                    <DetailRow
                      label={t("feedback.techTime")}
                      value={liveContext.timestamp}
                    />
                    <div>
                      <dt className="text-ink/50">
                        {t("feedback.techConsole")}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap break-all">
                        {liveContext.consoleErrors.length
                          ? liveContext.consoleErrors.join("\n")
                          : t("feedback.techConsoleEmpty")}
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>

              {error ? (
                <p className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-ink/8 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {t("feedback.discordPromoTitle")}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {t("feedback.discordPromoBody")}
                  </p>
                </div>
                <a
                  href={discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn-secondary ui-btn-sm inline-flex w-full items-center justify-center gap-2 sm:w-auto sm:self-start"
                >
                  <DiscordIcon className="size-4 text-[#5865F2]" />
                  {t("feedback.discordCta")}
                  <ExternalLink className="size-3 opacity-70" aria-hidden />
                  <span className="sr-only">{t("feedback.discordOpensNew")}</span>
                </a>
              </div>
              {surveyUrl ? (
                <div className="flex flex-col gap-2 rounded-xl border border-accent/15 bg-accent/5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {t("feedback.surveyPromoTitle")}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                      {t("feedback.surveyPromoBody")}
                    </p>
                  </div>
                  <a
                    href={surveyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn-secondary ui-btn-sm inline-flex w-full shrink-0 items-center justify-center gap-1.5 sm:w-auto"
                  >
                    <ClipboardList className="size-3.5" aria-hidden />
                    {t("feedback.surveyCta")}
                    <ExternalLink className="size-3 opacity-70" aria-hidden />
                    <span className="sr-only">{t("feedback.surveyOpensNew")}</span>
                  </a>
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-sm"
                  onClick={onClose}
                  disabled={submitting}
                >
                  {t("feedback.cancel")}
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary ui-btn-sm inline-flex items-center gap-1.5"
                  disabled={submitting || hideForCapture}
                >
                  {submitting ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {submitting ? t("feedback.sending") : t("feedback.submit")}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
      <dt className="text-ink/50">{label}</dt>
      <dd className="break-all text-ink-muted">{value}</dd>
    </div>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const key = `feedback.status.${status}` as const;
  const label = t(key);
  const display = label === key ? status : label;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium capitalize",
        status === "resolved"
          ? "bg-emerald-500/10 text-emerald-800"
          : status === "in-progress"
            ? "bg-sky-500/10 text-sky-800"
            : status === "triaged"
              ? "bg-amber-500/10 text-amber-900"
              : "bg-ink/8 text-ink-muted",
      )}
    >
      {display}
    </span>
  );
}
