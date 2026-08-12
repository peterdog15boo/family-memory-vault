/**
 * Client-safe celebration helpers.
 * Server outreach / Web Push live in `@/lib/celebrations/outreach` — never
 * re-export them here (`web-push` uses Node `net` and breaks the client bundle).
 */
export {
  celebrate,
  celebrateFromJourney,
  onCelebrate,
} from "@/lib/celebrations/bus";
export { mapJourneyCelebration } from "@/lib/celebrations/map-journey";
export {
  inAppPresentationForKeys,
  isMajorInAppMilestone,
  isMajorOutreachMilestone,
  pickOutreachMilestone,
} from "@/lib/celebrations/milestones";
export { playCelebrationChime } from "@/lib/celebrations/sound";
export type {
  CelebrationEvent,
  CelebrationPresentation,
} from "@/lib/celebrations/types";
export { CELEBRATION_EVENT } from "@/lib/celebrations/types";
