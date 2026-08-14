/**
 * Upload activity — thin wrapper over critical-work (idle session + dialogs).
 */

import {
  beginCriticalWork,
  getCriticalWorkSnapshot,
  subscribeCriticalWork,
  __resetCriticalWorkForTests,
} from "@/lib/session/critical-activity";

export function beginUploadActivity(): () => void {
  return beginCriticalWork("upload");
}

export function getActiveUploadCount(): number {
  return getCriticalWorkSnapshot().uploads;
}

export function subscribeUploadActivity(
  listener: (count: number) => void,
): () => void {
  return subscribeCriticalWork((snap) => listener(snap.uploads));
}

export function __resetUploadActivityForTests() {
  __resetCriticalWorkForTests();
}
