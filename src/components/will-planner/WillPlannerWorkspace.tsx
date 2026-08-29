"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { WillDisclaimerBanner } from "@/components/will-planner/WillDisclaimerBanner";
import { WillDraftReady } from "@/components/will-planner/WillDraftReady";
import { WillDraftsList } from "@/components/will-planner/WillDraftsList";
import { WillPlannerFields } from "@/components/will-planner/WillPlannerFields";
import { WillSigningPanel } from "@/components/will-planner/WillSigningPanel";
import { willExecutionStateLabel } from "@/lib/legacy/will-execution-by-state";
import {
  WILL_DISCLAIMER_VERSION,
  WILL_STEPS,
  getWillStep,
  nextWillStepId,
  prevWillStepId,
  resolveCurrentStepId,
  validateResiduePercents,
  visibleWillSteps,
  willProgressPercent,
  type SerializedWillDraft,
  type SerializedWillDraftSummary,
  type WillAnswers,
  type WillStepId,
} from "@/lib/will-planner";
import { cn } from "@/lib/utils";

export type WillPlannerView = "hub" | "interview" | "ready";

type WillPlannerWorkspaceProps = {
  initialDisclaimerAccepted: boolean;
  initialDraft: SerializedWillDraft | null;
  initialDrafts: SerializedWillDraftSummary[];
  initialView?: WillPlannerView;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText || "Something went wrong";
  }
}

export function WillPlannerWorkspace({
  initialDisclaimerAccepted,
  initialDraft,
  initialDrafts,
  initialView = "hub",
}: WillPlannerWorkspaceProps) {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    initialDisclaimerAccepted,
  );
  const [agreed, setAgreed] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [answers, setAnswers] = useState<WillAnswers>(
    initialDraft?.answers ?? {},
  );
  const [stepId, setStepId] = useState<WillStepId>(
    resolveCurrentStepId(initialDraft?.answers ?? {}),
  );
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<WillPlannerView>(() => {
    if (!initialDraft) return "hub";
    if (initialView === "ready" && initialDraft.generatedMarkdown) return "ready";
    if (initialView === "interview") return "interview";
    return "hub";
  });
  const [showSigningPanel, setShowSigningPanel] = useState(false);
  const dirtyRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  function refreshDraftsFromActive(next: SerializedWillDraft) {
    setDrafts((prev) => {
      const others = prev.filter((d) => d.id !== next.id);
      return [
        {
          id: next.id,
          status: next.status,
          stateCode: next.stateCode,
          disclaimerVersion: next.disclaimerVersion,
          generatedAt: next.generatedAt,
          createdAt: next.createdAt,
          updatedAt: next.updatedAt,
        },
        ...others,
      ];
    });
  }

  const visibleIds = useMemo(() => visibleWillSteps(answers), [answers]);
  const step = getWillStep(stepId) ?? WILL_STEPS[0]!;
  const progress = willProgressPercent(stepId, answers);
  const isReview = stepId === "review";
  const hasReadyDraft = Boolean(draft?.generatedMarkdown);
  const residueCheck = validateResiduePercents(answers);
  const signingStateLabel = willExecutionStateLabel(answers.stateCode);
  const readOnlyArchived = draft?.status === "archived";

  const persist = useCallback(
    async (
      nextAnswers: WillAnswers,
      nextStep: WillStepId,
      draftId: string,
    ) => {
      const res = await fetch("/api/legacy/will", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          stepId: nextStep,
          answers: { ...nextAnswers, currentStepId: nextStep },
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { draft: SerializedWillDraft };
      dirtyRef.current = false;
      setDraft(data.draft);
      setAnswers(data.draft.answers);
      refreshDraftsFromActive(data.draft);
      setSaveNote("Saved");
      window.setTimeout(() => setSaveNote(null), 1600);
      return data.draft;
    },
    [],
  );

  useEffect(() => {
    if (!draft || readOnlyArchived || view !== "interview") return;
    if (!dirtyRef.current) return;
    const draftId = draft.id;
    const timer = window.setTimeout(() => {
      if (!dirtyRef.current) return;
      void persist(answersRef.current, stepId, draftId).catch(() => {
        setSaveNote("Save failed");
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [answers, draft, persist, readOnlyArchived, stepId, view]);

  function onAnswersChange(next: WillAnswers) {
    dirtyRef.current = true;
    setAnswers(next);
  }

  function acceptDisclaimer() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/will/accept-disclaimer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agreed: true }),
        });
        if (!res.ok) throw new Error(await readError(res));
        setDisclaimerAccepted(true);

        const start = await fetch("/api/legacy/will", { method: "POST" });
        if (!start.ok) throw new Error(await readError(start));
        const data = (await start.json()) as { draft: SerializedWillDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId(resolveCurrentStepId(data.draft.answers));
        refreshDraftsFromActive(data.draft);
        setView("interview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      }
    });
  }

  function startPlanner() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/will", { method: "POST" });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { draft: SerializedWillDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId(resolveCurrentStepId(data.draft.answers));
        refreshDraftsFromActive(data.draft);
        setView("interview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      }
    });
  }

  function goNext() {
    if (!draft || readOnlyArchived) return;
    setShowSigningPanel(false);
    setError(null);
    const next = nextWillStepId(stepId, answers) ?? "review";
    startTransition(async () => {
      try {
        await persist(answers, next, draft.id);
        setStepId(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function goBack() {
    if (!draft || readOnlyArchived) return;
    const prev = prevWillStepId(stepId, answers);
    if (!prev) return;
    setShowSigningPanel(false);
    setError(null);
    startTransition(async () => {
      try {
        await persist(answers, prev, draft.id);
        setStepId(prev);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function jumpTo(id: WillStepId) {
    if (!draft || !visibleIds.includes(id) || readOnlyArchived) return;
    setShowSigningPanel(false);
    setError(null);
    startTransition(async () => {
      try {
        await persist(answers, id, draft.id);
        setStepId(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function buildDraft() {
    if (!draft || readOnlyArchived) return;
    if (!residueCheck.ok) {
      setError(residueCheck.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await persist(answers, "review", draft.id);
        const res = await fetch("/api/legacy/will/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: draft.id }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { draft: SerializedWillDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        refreshDraftsFromActive(data.draft);
        setView("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not build draft");
      }
    });
  }

  function startOver() {
    if (
      !window.confirm(
        "Start over? Your current draft will be archived and you will begin a new interview. This cannot be undone from the app.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/will/start-over", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as {
          draft: SerializedWillDraft;
          archivedId?: string | null;
        };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId("packs");
        setView("interview");
        setDrafts((prev) => {
          const archivedId = data.archivedId;
          const stamped = prev.map((d) =>
            archivedId && d.id === archivedId
              ? { ...d, status: "archived" as const }
              : d,
          );
          const withoutNew = stamped.filter((d) => d.id !== data.draft.id);
          return [
            {
              id: data.draft.id,
              status: data.draft.status,
              stateCode: data.draft.stateCode,
              disclaimerVersion: data.draft.disclaimerVersion,
              generatedAt: data.draft.generatedAt,
              createdAt: data.draft.createdAt,
              updatedAt: data.draft.updatedAt,
            },
            ...withoutNew,
          ];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start over");
      }
    });
  }

  function openInterview(atStep?: WillStepId) {
    setView("interview");
    setShowSigningPanel(false);
    if (atStep) setStepId(atStep);
    else setStepId(resolveCurrentStepId(answers));
  }

  if (!disclaimerAccepted) {
    return (
      <div className="space-y-6">
        <WillDraftsList drafts={drafts} />
        <WillDisclaimerBanner />
        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-6">
          <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
            Before you begin
          </h2>
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            The Will Planner walks through questions and builds a plain-language
            draft for an attorney to review. It is not a will and has no legal
            effect by itself.
          </p>
          <label className="mt-5 flex cursor-pointer gap-3 text-sm text-[color:var(--legacy-ink)]">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[color:var(--legacy-accent)]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I understand this is a planning draft only ({WILL_DISCLAIMER_VERSION}
              ). I have read the notice above.
            </span>
          </label>
          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!agreed || pending}
            onClick={acceptDisclaimer}
            className="ui-btn ui-btn-primary mt-5 inline-flex items-center gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Start will planner
          </button>
        </div>
      </div>
    );
  }

  if (draft && view === "ready" && hasReadyDraft) {
    return (
      <div className="space-y-6">
        <WillDraftsList drafts={drafts} activeDraftId={draft.id} />
        <WillDraftReady
          draft={draft}
          onBackToInterview={() => openInterview("review")}
          onDraftChange={(next) => {
            setDraft(next);
            refreshDraftsFromActive(next);
          }}
          onOpenHub={() => setView("hub")}
          onRegenerate={buildDraft}
          regenerating={pending}
        />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="space-y-6">
        <WillDraftsList drafts={drafts} />
        <WillDisclaimerBanner />
        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-6">
          <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
            Will planner
          </h2>
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Answer a few topics at a time. We save as you go so a refresh won’t
            lose your work.
          </p>
          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={startPlanner}
            className="ui-btn ui-btn-primary mt-5 inline-flex items-center gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="size-4" aria-hidden />
            )}
            Start will planner
          </button>
        </div>
      </div>
    );
  }

  if (view === "hub") {
    return (
      <div className="space-y-6">
        <WillDraftsList drafts={drafts} activeDraftId={draft.id} />
        <WillDisclaimerBanner compact />
        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--legacy-muted)]">
            {draft.status === "draft_ready"
              ? "Draft ready"
              : draft.status === "archived"
                ? "Archived draft"
                : "In progress"}
            {draft.stateCode ? ` · ${draft.stateCode}` : ""}
          </p>
          <h2 className="font-display mt-2 text-2xl text-[color:var(--legacy-ink)]">
            Will planner
          </h2>
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Your answers are saved on this device and account. Leave anytime —
            come back to continue where you left off.
          </p>
          {saveNote ? (
            <p className="mt-2 text-xs text-[color:var(--legacy-muted)]">
              {saveNote}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {!readOnlyArchived ? (
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => openInterview()}
              >
                Continue draft
              </button>
            ) : null}
            {!readOnlyArchived ? (
              <button
                type="button"
                className="ui-btn ui-btn-secondary"
                onClick={() => openInterview()}
              >
                Edit answers
              </button>
            ) : null}
            {hasReadyDraft ? (
              <button
                type="button"
                className="ui-btn ui-btn-secondary"
                onClick={() => setView("ready")}
              >
                View ready draft
              </button>
            ) : null}
            {!readOnlyArchived ? (
              <button
                type="button"
                className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
                disabled={pending || !residueCheck.ok}
                onClick={buildDraft}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileText className="size-4" aria-hidden />
                )}
                {hasReadyDraft ? "Re-generate" : "Build attorney draft"}
              </button>
            ) : null}
            {!readOnlyArchived ? (
              <button
                type="button"
                className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5"
                disabled={pending}
                onClick={startOver}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Start over
              </button>
            ) : null}
          </div>
          {!residueCheck.ok && !readOnlyArchived ? (
            <p className="mt-3 text-sm text-amber-900">
              Fix residue percents before re-generating: {residueCheck.error}
            </p>
          ) : null}
          {draft.plannerDocumentId ? (
            <p className="mt-4 text-sm">
              <a
                href={`/documents/${draft.plannerDocumentId}`}
                className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
              >
                Open PDF in Wills / Estate
              </a>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WillDraftsList drafts={drafts} activeDraftId={draft.id} />
      <WillDisclaimerBanner compact />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--legacy-muted)]">
            <span>
              Step {visibleIds.indexOf(stepId) + 1} of {visibleIds.length}
            </span>
            <span>{saveNote ?? `${progress}%`}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[color:var(--legacy-line)]"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[color:var(--legacy-accent)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("hub")}
            className="ui-btn ui-btn-ghost text-sm"
          >
            Home
          </button>
          {!readOnlyArchived ? (
            <button
              type="button"
              onClick={startOver}
              disabled={pending}
              className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5 text-sm"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Start over
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="space-y-1" aria-label="Will planner sections">
          {WILL_STEPS.filter((s) => visibleIds.includes(s.id)).map((s) => {
            const active = !showSigningPanel && s.id === stepId;
            const done =
              visibleIds.indexOf(s.id) < visibleIds.indexOf(stepId);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                disabled={pending || readOnlyArchived}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                  active
                    ? "bg-[color:var(--legacy-accent-soft)] font-medium text-[color:var(--legacy-ink)]"
                    : "text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-surface)] hover:text-[color:var(--legacy-ink)]",
                )}
              >
                {done ? (
                  <Check className="size-3.5 shrink-0 text-[color:var(--legacy-accent)]" />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
                {s.title}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowSigningPanel(true)}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
              showSigningPanel
                ? "bg-[color:var(--legacy-accent-soft)] font-medium text-[color:var(--legacy-ink)]"
                : "text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-surface)] hover:text-[color:var(--legacy-ink)]",
            )}
          >
            <span className="size-3.5 shrink-0" />
            Signing in {signingStateLabel}
          </button>
        </nav>

        {showSigningPanel ? (
          <WillSigningPanel
            stateCode={answers.stateCode ?? draft.stateCode}
            variant="full"
          />
        ) : (
          <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
            <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
              {step.title}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
              {step.description}
            </p>

            {!isReview ? (
              <div className="mt-6">
                <WillPlannerFields
                  step={step}
                  answers={answers}
                  onChange={onAnswersChange}
                />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-[color:var(--legacy-muted)]">
                  When you’re ready, build a plain-language attorney draft from
                  your answers. You can still jump back to edit any section.
                </p>
                {!residueCheck.ok ? (
                  <p className="text-sm text-red-700" role="alert">
                    {residueCheck.error}
                  </p>
                ) : null}
                {!readOnlyArchived ? (
                  <button
                    type="button"
                    disabled={pending || !residueCheck.ok}
                    onClick={buildDraft}
                    className="ui-btn ui-btn-primary inline-flex items-center gap-2"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <FileText className="size-4" aria-hidden />
                    )}
                    {hasReadyDraft
                      ? "Re-generate attorney draft"
                      : "Build attorney draft"}
                  </button>
                ) : null}
                {hasReadyDraft ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
                    onClick={() => setView("ready")}
                  >
                    View ready draft
                  </button>
                ) : null}
              </div>
            )}

            {error ? (
              <p className="mt-4 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            {!isReview && !readOnlyArchived ? (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={pending || !prevWillStepId(stepId, answers)}
                  className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={pending}
                  className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Save & continue
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
