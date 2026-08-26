"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  GitFork,
  Heart,
  Images,
  Sparkles,
  Trees,
  UserPlus,
  Users,
} from "lucide-react";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import {
  computeFamilyTreeCompleteness,
  type FamilyTreeCompletenessSnapshot,
  type TreeCompletenessBadgeId,
  type TreeNextAction,
} from "@/lib/family-tree/completeness";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";
import { cn } from "@/lib/utils";

const BADGE_STORAGE_KEY = "fmv-family-tree-badges-seen";

const BADGE_ICONS: Record<
  TreeCompletenessBadgeId,
  typeof GitFork
> = {
  first_branch: GitFork,
  three_generations: Trees,
  photo_complete_core: Images,
  ten_people: Users,
};

type Props = {
  tree: SerializedFamilyTreeGraph;
  peopleCount: number;
  availablePeople: SerializedFamilyTreePerson[];
  coverByPersonId: Map<string, FamilyTreePersonCover>;
  onPlacePerson: (personId: string) => void;
  onAddParent: (nodeId: string) => void;
  onAddPartner: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onFocusAddPerson: () => void;
  className?: string;
};

function readSeenBadges(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(BADGE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeSeenBadges(ids: Iterable<string>) {
  try {
    window.localStorage.setItem(BADGE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

/**
 * Fun, encouraging Family Tree Completeness — progress, badges, next step.
 */
export function FamilyTreeCompleteness({
  tree,
  peopleCount,
  availablePeople,
  coverByPersonId,
  onPlacePerson,
  onAddParent,
  onAddPartner,
  onSelectNode,
  onFocusAddPerson,
  className,
}: Props) {
  const snapshot = useMemo(() => {
    const hasPhotoByPersonId = new Map<string, boolean>();
    for (const [personId, cover] of coverByPersonId) {
      hasPhotoByPersonId.set(personId, Boolean(cover.previewUrl));
    }
    return computeFamilyTreeCompleteness({
      tree,
      peopleCount,
      availablePeople,
      hasPhotoByPersonId,
    });
  }, [tree, peopleCount, availablePeople, coverByPersonId]);

  const [celebrateBadge, setCelebrateBadge] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const primed = useRef(false);

  useEffect(() => {
    const seen = readSeenBadges();
    const newly = snapshot.badges.filter((b) => b.earned && !seen.has(b.id));

    // First paint: seed storage so existing badges don't all fire at once.
    if (!primed.current) {
      primed.current = true;
      if (newly.length > 0 && seen.size === 0 && snapshot.earnedBadgeIds.length > 0) {
        writeSeenBadges(snapshot.earnedBadgeIds);
        return;
      }
    }

    if (newly.length === 0) return;
    const next = newly[0]!;
    for (const b of newly) seen.add(b.id);
    writeSeenBadges(seen);
    setCelebrateBadge({ title: next.title, description: next.description });
    setBurstKey((k) => k + 1);
    const timer = window.setTimeout(() => setCelebrateBadge(null), 4200);
    return () => window.clearTimeout(timer);
  }, [snapshot.badges, snapshot.earnedBadgeIds]);

  function runNextAction(action: TreeNextAction) {
    if (action.kind === "place_person" && action.personId) {
      onPlacePerson(action.personId);
      return;
    }
    if (action.kind === "add_parents" && action.nodeId) {
      onAddParent(action.nodeId);
      return;
    }
    if (action.kind === "add_partner" && action.nodeId) {
      onAddPartner(action.nodeId);
      return;
    }
    if (
      (action.kind === "link_photo" || action.kind === "upload_photo") &&
      action.nodeId
    ) {
      onSelectNode(action.nodeId);
      return;
    }
    if (action.kind === "add_person") {
      onFocusAddPerson();
    }
  }

  return (
    <section
      className={cn("family-tree-completeness", className)}
      aria-labelledby="family-tree-completeness-title"
    >
      {celebrateBadge ? (
        <div
          key={burstKey}
          className="family-tree-completeness-toast"
          role="status"
        >
          <Sparkles className="size-4 shrink-0 text-accent-deep" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Milestone unlocked: {celebrateBadge.title}
            </p>
            <p className="text-xs text-ink-muted">{celebrateBadge.description}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
            Growing together
          </p>
          <h2
            id="family-tree-completeness-title"
            className="mt-1 font-display text-2xl tracking-tight text-ink"
          >
            Family Tree Completeness
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            {snapshot.encouragement}
          </p>
        </div>
        <div
          className="family-tree-completeness-score"
          aria-label={`${snapshot.percent}% complete`}
        >
          <p className="font-display text-3xl tracking-tight text-ink">
            {snapshot.percent}%
          </p>
          <p className="text-xs text-ink-muted">complete</p>
        </div>
      </div>

      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={snapshot.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Family tree completeness"
      >
        <div
          className="family-tree-completeness-bar"
          style={{ width: `${snapshot.percent}%` }}
        />
      </div>

      <ul className="family-tree-completeness-metrics">
        {snapshot.metrics.map((metric) => (
          <li key={metric.id} className="family-tree-completeness-metric">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{metric.label}</span>
              <span className="text-xs tabular-nums text-ink-muted">
                {metric.total === 0 ? "—" : `${metric.done}/${metric.total}`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/8">
              <div
                className="h-full rounded-full bg-accent/80 transition-all duration-500"
                style={{
                  width: `${metric.total === 0 ? 0 : metric.percent}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
          Milestones
        </p>
        <ul className="family-tree-completeness-badges">
          {snapshot.badges.map((badge) => {
            const Icon = BADGE_ICONS[badge.id];
            return (
              <li key={badge.id}>
                <div
                  className={cn(
                    "family-tree-completeness-badge",
                    badge.earned && "family-tree-completeness-badge--earned",
                  )}
                >
                  <span className="family-tree-completeness-badge-icon">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug">
                      {badge.title}
                    </span>
                    <span className="block text-[0.7rem] leading-snug text-ink-muted">
                      {badge.description}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <NextActionRow
        snapshot={snapshot}
        onRun={runNextAction}
      />
    </section>
  );
}

function NextActionRow({
  snapshot,
  onRun,
}: {
  snapshot: FamilyTreeCompletenessSnapshot;
  onRun: (action: TreeNextAction) => void;
}) {
  const action = snapshot.nextAction;
  const secondary =
    action.kind === "invite_family" ? null : (
      <Link href="/family" className="ui-btn ui-btn-ghost ui-btn-sm">
        <Heart className="size-3.5" aria-hidden />
        Ask family to help
      </Link>
    );

  const useHref =
    Boolean(action.href) &&
    (action.kind === "invite_family" || action.kind === "upload_photo");

  return (
    <div className="family-tree-completeness-next">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
          Next best step
        </p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{action.title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{action.body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondary}
        {useHref && action.href ? (
          <Link
            href={action.href}
            className="ui-btn ui-btn-primary ui-btn-sm inline-flex"
          >
            {action.kind === "upload_photo" ? (
              <Camera className="size-3.5" aria-hidden />
            ) : (
              <Heart className="size-3.5" aria-hidden />
            )}
            {action.cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            className="ui-btn ui-btn-primary ui-btn-sm inline-flex"
            onClick={() => onRun(action)}
          >
            {action.kind === "link_photo" ? (
              <Camera className="size-3.5" aria-hidden />
            ) : action.kind === "add_person" || action.kind === "place_person" ? (
              <UserPlus className="size-3.5" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            {action.cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
