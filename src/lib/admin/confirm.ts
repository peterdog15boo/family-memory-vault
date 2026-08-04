/**
 * Browser confirm helper for destructive / irreversible admin actions.
 * Returns true when the operator confirms.
 */
export function confirmAdminAction(message: string): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(message);
}
