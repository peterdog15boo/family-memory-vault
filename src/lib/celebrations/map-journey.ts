import { inAppPresentationForKeys } from "@/lib/celebrations/milestones";
import type {
  CelebrationEvent,
  CelebrationPresentation,
} from "@/lib/celebrations/types";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

export function celebrationFingerprint(
  payload: Pick<
    JourneyCelebrationPayload,
    "achievements" | "track" | "newLevel" | "lpGained"
  >,
): string {
  const ids = payload.achievements.map((a) => a.id).filter(Boolean).sort();
  if (ids.length > 0) return ids.join(",");
  return `${payload.track}:lv${payload.newLevel}:lp${payload.lpGained}`;
}

export function mapJourneyCelebration(
  payload: JourneyCelebrationPayload,
  id: string,
): CelebrationEvent {
  const keys = payload.achievements.map((a) => a.key);
  const presentation: CelebrationPresentation =
    payload.presentation ??
    (payload.kind === "level_up" && keys.length === 0
      ? "micro"
      : inAppPresentationForKeys(keys));
  const badge = payload.achievements[0];
  const full = presentation === "full";

  return {
    id,
    fingerprint: celebrationFingerprint(payload),
    track: payload.track,
    presentation,
    title: badge?.title ?? "",
    body: badge?.description,
    lpGained: payload.lpGained,
    previousLevel: payload.previousLevel,
    newLevel: payload.newLevel,
    nextGoal: payload.nextGoal,
    notificationId: id.startsWith("optimistic:") ? undefined : id,
    effects: {
      confetti: full,
      badgeReveal: full && Boolean(badge),
      lpCount: full && payload.lpGained > 0,
      sound: full,
    },
  };
}
