/**
 * Public feature flag for beta in-app feedback UI.
 * Set NEXT_PUBLIC_ENABLE_BETA_FEEDBACK=true to show header + FAB entry points.
 */

export function isBetaFeedbackEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_BETA_FEEDBACK?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
