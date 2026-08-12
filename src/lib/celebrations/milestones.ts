/**
 * Which unlocks deserve a full in-app moment vs a quiet email.
 * Keep both lists short so older relatives aren’t overwhelmed.
 */

export const MAJOR_IN_APP_KEYS = new Set([
  "photos.1",
  "photos.50",
  "photos.100",
  "memories.1",
  "memories.50",
  "family.1",
  "family.builder.1",
  "legacy.25",
  "legacy.50",
  "legacy.75",
  "legacy.100",
]);

/** Email / push — rarer than in-app full celebrations. */
export const MAJOR_OUTREACH_KEYS = new Set([
  "photos.1",
  "photos.50",
  "family.builder.1",
  "legacy.50",
  "legacy.100",
]);

const OUTREACH_HREF: Record<string, string> = {
  "photos.1": "/media",
  "photos.50": "/media",
  "family.builder.1": "/family",
  "legacy.50": "/legacy",
  "legacy.100": "/legacy",
};

export function isMajorInAppMilestone(key: string): boolean {
  return MAJOR_IN_APP_KEYS.has(key);
}

export function isMajorOutreachMilestone(key: string): boolean {
  return MAJOR_OUTREACH_KEYS.has(key);
}

export function inAppPresentationForKeys(
  keys: readonly string[],
): "micro" | "full" {
  return keys.some((key) => isMajorInAppMilestone(key)) ? "full" : "micro";
}

export function pickOutreachMilestone<T extends { key: string }>(
  achievements: readonly T[],
): T | null {
  const order = [...MAJOR_OUTREACH_KEYS];
  for (const key of order) {
    const match = achievements.find((a) => a.key === key);
    if (match) return match;
  }
  return null;
}

export function hrefForOutreachKey(key: string): string {
  return OUTREACH_HREF[key] ?? "/dashboard";
}
