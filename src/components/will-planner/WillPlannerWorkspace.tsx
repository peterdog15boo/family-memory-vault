"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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

type WillPlannerWorkspaceProps = {
  initialDisclaimerAccepted: boolean;
  initialDraft: SerializedWillDraft | null;
  initialDrafts: SerializedWillDraftSummary[];
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
  const [showReadyView, setShowReadyView] = useState(
    initialDraft?.status === "draft_ready",
  );
  const [showSigningPanel, setShowSigningPanel] = useState(false);

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
  const hasReadyDraft =
    draft?.status === "draft_ready" && Boolean(draft.generatedMarkdown);
  const residueCheck = validateResiduePercents(answers);
  const signingStateLabel = willExecutionStateLabel(answers.stateCode);

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
      setDraft(data.draft);
      setAnswers(data.draft.answers);
      setSaveNote("Saved");
      window.setTimeout(() => setSaveNote(null), 1600);
      return data.draft;
    },
    [],
  );

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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      }
    });
  }

  function goNext() {
    if (!draft) return;
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
    if (!draft) return;
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
    if (!draft || !visibleIds.includes(id)) return;
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
    if (!draft) return;
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
        setShowReadyView(true);
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
        const data = (await res.json()) as { draft: SerializedWillDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId("packs");
        setShowReadyView(false);
        refreshDraftsFromActive(data.draft);
        // Keep archived rows: refetch list summaries via local archive stamp
        setDrafts((prev) => {
          const withoutNew = prev.filter((d) => d.id !== data.draft.id);
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

  if (draft && showReadyView && hasReadyDraft) {
    return (
      <div className="space-y-6">
        <WillDraftsList drafts={drafts} />
        <WillDraftReady
          draft={draft}
          onBackToInterview={() => {
            setShowReadyView(false);
            setStepId("review");
          }}
          onDraftChange={(next) => {
            setDraft(next);
            refreshDraftsFromActive(next);
          }}
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
            Answer a few topics at a time. We save after every step so a refresh
            won’t lose your work.
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

  return (
    <div className="space-y-6">
      <WillDraftsList drafts={drafts} />
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
        <button
          type="button"
          onClick={startOver}
          disabled={pending}
          className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5 text-sm"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Start over
        </button>
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
                disabled={pending}
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
                onChange={setAnswers}
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
                Build attorney draft
              </button>
              {hasReadyDraft ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
                  onClick={() => setShowReadyView(true)}
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

          {!isReview ? (
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
