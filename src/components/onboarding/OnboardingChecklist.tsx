"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ImageIcon,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { MediaSection } from "@/components/media-section";
import { cn } from "@/lib/utils";
import type { OnboardingProgress, OnboardingStepId } from "@/lib/onboarding/types";

type Props = {
  progress: OnboardingProgress;
};

const STEP_ICONS: Record<OnboardingStepId, typeof Sparkles> = {
  welcome: Sparkles,
  upload: Upload,
  memory: ImageIcon,
  invite: Users,
};

export function OnboardingChecklist({ progress: initial }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [hidden, setHidden] = useState(!initial.show);
  const [pending, startTransition] = useTransition();

  if (hidden || !progress.show) return null;

  async function postAction(action: "dismiss" | "welcome_seen") {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { progress: OnboardingProgress };
    setProgress(data.progress);
    if (!data.progress.show) setHidden(true);
    startTransition(() => router.refresh());
  }

  function handleDismiss() {
    setHidden(true);
    void postAction("dismiss");
  }

  function handleWelcomeGotIt() {
    void postAction("welcome_seen");
  }

  const welcomeTitle = progress.firstName
    ? t("onboarding.welcomeTitleNamed", { name: progress.firstName })
    : t("onboarding.welcomeTitle");

  return (
    <MediaSection
      treatment="welcomeSoft"
      glass
      glassStrength="soft"
      aria-labelledby="onboarding-heading"
      className="onboarding-welcome rounded-2xl"
      contentClassName="p-0.5"
      glassClassName="border-accent/20 bg-canvas/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
            {t("onboarding.eyebrow")}
          </p>
          <h2
            id="onboarding-heading"
            className="mt-1 font-display text-xl tracking-tight text-ink sm:text-2xl"
          >
            {welcomeTitle}
          </h2>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
            {t("onboarding.lead")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink"
          aria-label={t("onboarding.dismissAria")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span>
            {t("onboarding.progressCount", {
              done: progress.completedCount,
              total: progress.totalCount,
            })}
          </span>
          <span>{progress.percent}%</span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("onboarding.progressAria")}
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {progress.steps.map((step) => {
          const Icon = STEP_ICONS[step.id];
          return (
            <li
              key={step.id}
              className={cn(
                "onboarding-step flex items-center gap-3 rounded-xl border px-3.5 py-3 transition",
                step.done
                  ? "border-ink/6 bg-canvas/60 opacity-75"
                  : "border-ink/10 bg-canvas/90",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  step.done
                    ? "bg-accent/20 text-accent-deep"
                    : "bg-ink/5 text-ink-muted",
                )}
              >
                {step.done ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    step.done
                      ? "font-medium text-ink/70 line-through decoration-ink/20"
                      : "font-medium text-ink",
                  )}
                >
                  {step.title}
                  {step.optional && !step.done ? (
                    <span className="ml-1.5 text-xs font-normal text-ink-muted">
                      {t("onboarding.optionalBadge")}
                    </span>
                  ) : null}
                </p>
                {!step.done ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {step.description}
                  </p>
                ) : null}
              </div>

              {!step.done ? (
                step.id === "welcome" ? (
                  <button
                    type="button"
                    onClick={handleWelcomeGotIt}
                    disabled={pending}
                    className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
                  >
                    {step.ctaLabel}
                  </button>
                ) : (
                  <Link
                    href={step.href}
                    className="ui-btn ui-btn-secondary ui-btn-sm shrink-0"
                  >
                    {step.ctaLabel}
                  </Link>
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className="text-xs font-medium text-ink-muted transition hover:text-ink"
        >
          {t("onboarding.skipForNow")}
        </button>
      </div>
    </MediaSection>
  );
}
