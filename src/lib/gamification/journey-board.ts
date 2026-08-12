/**
 * Dashboard “Your Legacy Journey” snapshot — serializable, no Date objects.
 */

import { LP_PER_LEVEL, lpIntoCurrentLevel } from "@/lib/gamification/levels";
import type {
  JourneyTrack,
  JourneyTrackKind,
  UnlockedAchievement,
  UserJourney,
} from "@/lib/gamification/types";

export const JOURNEY_TRACK_HREFS: Record<JourneyTrackKind, string> = {
  photos: "/upload",
  memories: "/memories/new",
  family: "/family",
  legacy: "/legacy",
};

const LEVEL_TITLES = [
  "Vault Starter",
  "Family Archivist",
  "Story Keeper",
  "Memory Keeper",
  "Heirloom Keeper",
  "Legacy Steward",
  "Vault Guardian",
  "Circle Builder",
  "Legacy Luminary",
  "Family Historian",
] as const;

export function memoryKeeperTitle(level: number): string {
  const n = Math.max(1, Math.floor(level));
  return LEVEL_TITLES[Math.min(n, LEVEL_TITLES.length) - 1]!;
}

export type JourneyBoardTrack = {
  category: JourneyTrackKind;
  label: string;
  current: number;
  unit: "count" | "percent";
  nextThreshold: number | null;
  nextTitle: string | null;
  href: string;
  ratio: number;
};

export type JourneyNextAction = {
  category: JourneyTrackKind;
  href: string;
  remaining: number;
  threshold: number;
  current: number;
  badgeTitle: string;
  kind:
    | "photos"
    | "memories"
    | "family_invite"
    | "family_builder"
    | "family_circle"
    | "legacy";
};

export type JourneyBoardBadge = {
  id: string;
  title: string;
  category: JourneyTrackKind;
  unlockedAt: string;
};

export type JourneyBoardSnapshot = {
  level: number;
  levelTitle: string;
  totalLp: number;
  lpInLevel: number;
  lpToNext: number;
  lpPerLevel: number;
  tracks: JourneyBoardTrack[];
  recentBadges: JourneyBoardBadge[];
  nextAction: JourneyNextAction | null;
};

function asTrackKind(category: string): JourneyTrackKind {
  if (category === "memories") return "memories";
  if (category === "family") return "family";
  if (category === "legacy") return "legacy";
  return "photos";
}

function actionKind(
  category: JourneyTrackKind,
  key: string,
): JourneyNextAction["kind"] {
  if (category === "photos") return "photos";
  if (category === "memories") return "memories";
  if (category === "legacy") return "legacy";
  if (key === "family.invite.sent") return "family_invite";
  if (key.startsWith("family.builder.")) return "family_builder";
  return "family_circle";
}

export function recommendNextAction(
  tracks: readonly JourneyTrack[],
): JourneyNextAction | null {
  const ranked = tracks
    .filter((track) => track.nextMilestone)
    .map((track) => {
      const next = track.nextMilestone!;
      const remaining = Math.max(0, next.threshold - track.current);
      const ratio =
        next.threshold > 0
          ? Math.min(1, Math.max(0, track.current / next.threshold))
          : 0;
      return { track, next, remaining, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio || a.remaining - b.remaining);

  const pick = ranked[0];
  if (!pick) return null;
  const category = asTrackKind(pick.track.category);
  return {
    category,
    href: JOURNEY_TRACK_HREFS[category],
    remaining: pick.remaining,
    threshold: pick.next.threshold,
    current: pick.track.current,
    badgeTitle: pick.next.title,
    kind: actionKind(category, pick.next.key),
  };
}

function toBoardTrack(track: JourneyTrack): JourneyBoardTrack {
  const category = asTrackKind(track.category);
  const next = track.nextMilestone;
  const ratio = next
    ? Math.min(1, Math.max(0, track.current / Math.max(1, next.threshold)))
    : 1;
  return {
    category,
    label: track.label,
    current: track.current,
    unit: track.unit,
    nextThreshold: next?.threshold ?? null,
    nextTitle: next?.title ?? null,
    href: JOURNEY_TRACK_HREFS[category],
    ratio,
  };
}

export function journeyBoardFromJourney(
  journey: UserJourney,
): JourneyBoardSnapshot {
  const { level, lpInLevel, lpToNext } = lpIntoCurrentLevel(journey.totalLp);
  const unlocked: UnlockedAchievement[] = journey.tracks.flatMap(
    (track) => track.unlocked,
  );
  const recentBadges = [...unlocked]
    .sort(
      (a, b) =>
        new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
    )
    .slice(0, 12)
    .map((badge) => ({
      id: badge.id,
      title: badge.title,
      category: asTrackKind(badge.category),
      unlockedAt: badge.unlockedAt,
    }));

  return {
    level,
    levelTitle: memoryKeeperTitle(level),
    totalLp: journey.totalLp,
    lpInLevel,
    lpToNext,
    lpPerLevel: LP_PER_LEVEL,
    tracks: journey.tracks.map(toBoardTrack),
    recentBadges,
    nextAction: recommendNextAction(journey.tracks),
  };
}

export function emptyJourneyBoard(): JourneyBoardSnapshot {
  return {
    level: 1,
    levelTitle: memoryKeeperTitle(1),
    totalLp: 0,
    lpInLevel: 0,
    lpToNext: LP_PER_LEVEL,
    lpPerLevel: LP_PER_LEVEL,
    tracks: [
      {
        category: "photos",
        label: "Photos",
        current: 0,
        unit: "count",
        nextThreshold: 1,
        nextTitle: "First Snapshot Badge",
        href: "/upload",
        ratio: 0,
      },
      {
        category: "memories",
        label: "Memories",
        current: 0,
        unit: "count",
        nextThreshold: 1,
        nextTitle: "First Story Badge",
        href: "/memories/new",
        ratio: 0,
      },
      {
        category: "family",
        label: "Family",
        current: 0,
        unit: "count",
        nextThreshold: 1,
        nextTitle: "Invitation Sent",
        href: "/family",
        ratio: 0,
      },
      {
        category: "legacy",
        label: "Digital Legacy",
        current: 0,
        unit: "percent",
        nextThreshold: 25,
        nextTitle: "Bronze Legacy Guardian",
        href: "/legacy",
        ratio: 0,
      },
    ],
    recentBadges: [],
    nextAction: {
      category: "photos",
      href: "/upload",
      remaining: 1,
      threshold: 1,
      current: 0,
      badgeTitle: "First Snapshot Badge",
      kind: "photos",
    },
  };
}
