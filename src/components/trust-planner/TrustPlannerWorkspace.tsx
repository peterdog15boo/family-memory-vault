"use client";

import Link from "next/link";
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
import { TrustDisclaimerBanner } from "@/components/trust-planner/TrustDisclaimerBanner";
import { TrustDraftReady } from "@/components/trust-planner/TrustDraftReady";
import { TrustDraftsList } from "@/components/trust-planner/TrustDraftsList";
import { TrustPlannerFields } from "@/components/trust-planner/TrustPlannerFields";
import {
  TRUST_DISCLAIMER_TEXT,
  TRUST_DISCLAIMER_VERSION,
  TRUST_STEPS,
  getTrustStep,
  nextTrustStepId,
  prevTrustStepId,
  resolveCurrentTrustStepId,
  trustProgressPercent,
  validateTrustResiduePercents,
  visibleTrustSteps,
  type SerializedTrustDraft,
  type SerializedTrustDraftSummary,
  type TrustAnswers,
  type TrustStepId,
} from "@/lib/trust-planner";
import { cn } from "@/lib/utils";

export type TrustPlannerView = "hub" | "interview" | "ready";

type TrustPlannerWorkspaceProps = {
  initialDisclaimerAccepted: boolean;
  initialDraft: SerializedTrustDraft | null;
  initialDrafts: SerializedTrustDraftSummary[];
  initialView?: TrustPlannerView;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText || "Something went wrong";
  }
}

export function TrustPlannerWorkspace({
  initialDisclaimerAccepted,
  initialDraft,
  initialDrafts,
  initialView = "hub",
}: TrustPlannerWorkspaceProps) {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    initialDisclaimerAccepted,
  );
  const [agreed, setAgreed] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [answers, setAnswers] = useState<TrustAnswers>(
    initialDraft?.answers ?? {},
  );
  const [stepId, setStepId] = useState<TrustStepId>(
    resolveCurrentTrustStepId(initialDraft?.answers ?? {}),
  );
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<TrustPlannerView>(() => {
    if (!initialDraft) return "hub";
    if (initialView === "ready" && initialDraft.generatedMarkdown) {
      return "ready";
    }
    if (initialView === "interview") return "interview";
    return "hub";
  });
  const dirtyRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  function refreshDraftsFromActive(next: SerializedTrustDraft) {
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

  const visibleIds = useMemo(() => visibleTrustSteps(answers), [answers]);
  const step = getTrustStep(stepId) ?? TRUST_STEPS[0]!;
  const progress = trustProgressPercent(stepId, answers);
  const isReview = stepId === "review";
  const hasReadyDraft = Boolean(draft?.generatedMarkdown);
  const readOnlyArchived = draft?.status === "archived";
  const residueCheck = validateTrustResiduePercents(answers);

  const persist = useCallback(
    async (
      nextAnswers: TrustAnswers,
      nextStep: TrustStepId,
      draftId: string,
    ) => {
      const res = await fetch("/api/legacy/trust", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          stepId: nextStep,
          answers: { ...nextAnswers, currentStepId: nextStep },
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { draft: SerializedTrustDraft };
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

  function onAnswersChange(next: TrustAnswers) {
    dirtyRef.current = true;
    setAnswers(next);
  }

  function acceptDisclaimer() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/trust/accept-disclaimer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agreed: true }),
        });
        if (!res.ok) throw new Error(await readError(res));
        setDisclaimerAccepted(true);

        const start = await fetch("/api/legacy/trust", { method: "POST" });
        if (!start.ok) throw new Error(await readError(start));
        const data = (await start.json()) as { draft: SerializedTrustDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId(resolveCurrentTrustStepId(data.draft.answers));
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
        const res = await fetch("/api/legacy/trust", { method: "POST" });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { draft: SerializedTrustDraft };
        setDraft(data.draft);
        setAnswers(data.draft.answers);
        setStepId(resolveCurrentTrustStepId(data.draft.answers));
        refreshDraftsFromActive(data.draft);
        setView("interview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      }
    });
  }

  function goNext() {
    if (!draft || readOnlyArchived) return;
    setError(null);
    const next = nextTrustStepId(stepId, answers) ?? "review";
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
    const prev = prevTrustStepId(stepId, answers);
    if (!prev) return;
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

  function jumpTo(id: TrustStepId) {
    if (!draft || !visibleIds.includes(id) || readOnlyArchived) return;
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
        const res = await fetch("/api/legacy/trust/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: draft.id }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { draft: SerializedTrustDraft };
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
        const res = await fetch("/api/legacy/trust/start-over", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as {
          draft: SerializedTrustDraft;
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

  function openInterview(atStep?: TrustStepId) {
    setView("interview");
    if (atStep) setStepId(atStep);
    else setStepId(resolveCurrentTrustStepId(answers));
  }

  if (!disclaimerAccepted) {
    return (
      <div className="space-y-6">
        <TrustDraftsList drafts={drafts} />
        <TrustDisclaimerBanner />
        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-6">
          <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
            Will vs. living trust
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            A <strong className="font-medium text-[color:var(--legacy-ink)]">will</strong>{" "}
            tells a court who should receive your property after death and names
            an executor. It usually goes through probate unless your state offers
            a simplified process.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            A <strong className="font-medium text-[color:var(--legacy-ink)]">living trust</strong>{" "}
            is a separate document you sign during life. You (or someone you
            name) manage assets held in the trust. After death, trust assets
            typically pass without probate — but only if you{" "}
            <strong className="font-medium text-[color:var(--legacy-ink)]">
              fund
            </strong>{" "}
            the trust by retitling property or updating beneficiary
            designations.
          </p>
          <p className="mt-3 text-sm text-[color:var(--legacy-muted)]">
            Many people use a{" "}
            <strong className="font-medium text-[color:var(--legacy-ink)]">
              pour-over will
            </strong>{" "}
            alongside a trust to catch assets not yet moved into it.{" "}
            <Link
              href="/legacy/will"
              className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
            >
              Open Will Planner
            </Link>{" "}
            for a companion pour-over draft.
          </p>

          <h3 className="font-display mt-6 text-lg text-[color:var(--legacy-ink)]">
            Before you begin
          </h3>
          <label className="mt-4 flex cursor-pointer gap-3 text-sm text-[color:var(--legacy-ink)]">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[color:var(--legacy-accent)]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {TRUST_DISCLAIMER_TEXT} ({TRUST_DISCLAIMER_VERSION})
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
            Start trust planner
          </button>
        </div>
      </div>
    );
  }

  if (draft && view === "ready" && hasReadyDraft) {
    return (
      <div className="space-y-6">
        <TrustDraftsList drafts={drafts} activeDraftId={draft.id} />
        <TrustDraftReady
          draft={draft}
          onBackToInterview={() => openInterview("review")}
          onOpenHub={() => setView("hub")}
          onRegenerate={buildDraft}
          onDraftChange={(next) => {
            setDraft(next);
            refreshDraftsFromActive(next);
          }}
          regenerating={pending}
        />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="space-y-6">
        <TrustDraftsList drafts={drafts} />
        <TrustDisclaimerBanner />
        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-6">
          <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
            Living trust planner
          </h2>
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Answer a few topics at a time. We save as you go so a refresh won&apos;t
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
            Start trust planner
          </button>
        </div>
      </div>
    );
  }

  if (view === "hub") {
    return (
      <div className="space-y-6">
        <TrustDraftsList drafts={drafts} activeDraftId={draft.id} />
        <TrustDisclaimerBanner compact />
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
            Living trust planner
          </h2>
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Your answers are saved on this account. Leave anytime — come back to
            continue where you left off.
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
                {hasReadyDraft ? "Re-generate draft" : "Build attorney draft"}
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
              Fix residue percents before generating: {residueCheck.error}
            </p>
          ) : null}

          {draft.linkedWillDraftId ? (
            <p className="mt-4 text-sm">
              <Link
                href={`/legacy/will?draft=${encodeURIComponent(draft.linkedWillDraftId)}&view=hub`}
                className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
              >
                Linked Will Planner draft
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TrustDraftsList drafts={drafts} activeDraftId={draft.id} />
      <TrustDisclaimerBanner compact />

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
        <nav className="space-y-1" aria-label="Trust planner sections">
          {TRUST_STEPS.filter((s) => visibleIds.includes(s.id)).map((s) => {
            const active = s.id === stepId;
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
        </nav>

        <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
          <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
            {step.title}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
            {step.description}
          </p>

          <div className="mt-5">
            <TrustPlannerFields
              step={step}
              answers={answers}
              onChange={onAnswersChange}
            />
          </div>

          {error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--legacy-line)] pt-5">
            <button
              type="button"
              className="ui-btn ui-btn-secondary inline-flex items-center gap-1"
              disabled={pending || !prevTrustStepId(stepId, answers) || readOnlyArchived}
              onClick={goBack}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </button>
            {!readOnlyArchived ? (
              isReview ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-primary inline-flex items-center gap-2"
                  disabled={pending || !residueCheck.ok}
                  onClick={buildDraft}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileText className="size-4" aria-hidden />
                  )}
                  Build attorney draft
                </button>
              ) : (
                <button
                  type="button"
                  className="ui-btn ui-btn-primary inline-flex items-center gap-1"
                  disabled={pending}
                  onClick={goNext}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
