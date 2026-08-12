/**
 * Photo library-ready hook: award LP/badges, then in-app notification.
 * Called after moderation clean (worker or human review) — not at R2 upload.
 */

import type { MediaType } from "@/lib/db/schema";
import { getUserFamilies } from "@/lib/families";
import {
  celebrationFromAward,
  mergeCelebrations,
} from "@/lib/gamification/celebration";
import { afterFamilyMemberFirstContribution } from "@/lib/gamification/family-invite";
import { hookPhotoReady } from "@/lib/gamification/hooks";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

export async function afterPhotoBecameLibraryReady(input: {
  userId: string;
  mediaId: string;
  filename?: string | null;
  mediaType?: MediaType | null;
}): Promise<void> {
  let celebration: JourneyCelebrationPayload | null = null;

  try {
    const families = await getUserFamilies(input.userId);
    const familyId = families[0]?.id ?? null;
    const result =
      input.mediaType === "video"
        ? null
        : await hookPhotoReady({
            userId: input.userId,
            familyId,
            mediaId: input.mediaId,
          });

    if (result) {
      celebration = await celebrationFromAward(result, "photos");
    }
    const familyCelebration = await afterFamilyMemberFirstContribution({
      userId: input.userId,
      familyId,
    });
    celebration = mergeCelebrations(celebration, familyCelebration);
    if (celebration?.achievements.length) {
      const { queueMajorMilestoneOutreach } = await import(
        "@/lib/celebrations/outreach"
      );
      queueMajorMilestoneOutreach({
        userId: input.userId,
        achievements: celebration.achievements,
        href: "/media",
      });
    }
  } catch (error) {
    console.error("[gamification] afterPhotoBecameLibraryReady award failed", {
      userId: input.userId,
      mediaId: input.mediaId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const { sendMediaReadyNotification } = await import("@/lib/email/lifecycle");
    await sendMediaReadyNotification({
      userId: input.userId,
      mediaId: input.mediaId,
      filename: input.filename,
      celebration,
    });
  } catch (error) {
    console.error("[gamification] media ready notification failed", {
      userId: input.userId,
      mediaId: input.mediaId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
