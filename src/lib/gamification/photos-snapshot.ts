import { memoryBadgeName, photoBadgeName } from "@/lib/gamification/catalog";
import type {
  JourneyTrackKind,
  UserJourney,
} from "@/lib/gamification/types";

export type JourneyTrackSnapshot = {
  category: JourneyTrackKind;
  current: number;
  nextThreshold: number | null;
  nextName: string | null;
  nextLp: number | null;
  level: number;
  totalLp: number;
  complete: boolean;
};

/** @deprecated Use JourneyTrackSnapshot */
export type PhotosJourneySnapshot = JourneyTrackSnapshot;

const EMPTY: Record<"photos" | "memories", JourneyTrackSnapshot> = {
  photos: {
    category: "photos",
    current: 0,
    nextThreshold: 1,
    nextName: photoBadgeName(1),
    nextLp: 10,
    level: 1,
    totalLp: 0,
    complete: false,
  },
  memories: {
    category: "memories",
    current: 0,
    nextThreshold: 1,
    nextName: memoryBadgeName(1),
    nextLp: 15,
    level: 1,
    totalLp: 0,
    complete: false,
  },
};

export function emptyJourneySnapshot(
  category: "photos" | "memories",
): JourneyTrackSnapshot {
  return { ...EMPTY[category] };
}

export function journeySnapshotFromJourney(
  journey: UserJourney,
  category: "photos" | "memories",
): JourneyTrackSnapshot {
  const track = journey.tracks.find((t) => t.category === category);
  const next = track?.nextMilestone ?? null;
  const badgeName = category === "photos" ? photoBadgeName : memoryBadgeName;
  return {
    category,
    current: track?.current ?? 0,
    nextThreshold: next?.threshold ?? null,
    nextName: next ? badgeName(next.threshold) : null,
    nextLp: next?.lpReward ?? null,
    level: journey.level,
    totalLp: journey.totalLp,
    complete: !next,
  };
}

export function photosSnapshotFromJourney(
  journey: UserJourney,
): JourneyTrackSnapshot {
  return journeySnapshotFromJourney(journey, "photos");
}

export function memoriesSnapshotFromJourney(
  journey: UserJourney,
): JourneyTrackSnapshot {
  return journeySnapshotFromJourney(journey, "memories");
}
