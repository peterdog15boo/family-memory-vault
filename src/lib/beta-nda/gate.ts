/**
 * Layout/page helper: should we send this user to /beta-agree?
 */

import {
  hasAcceptedBetaNda,
  isBetaNdaRequired,
} from "@/lib/beta-nda";

export async function shouldRedirectToBetaNda(
  userId: string,
): Promise<boolean> {
  if (!isBetaNdaRequired()) return false;
  try {
    return !(await hasAcceptedBetaNda(userId));
  } catch (error) {
    // Fail closed while the gate is enabled — do not open the app if we
    // cannot confirm acceptance.
    console.error("[beta-nda.gate] acceptance check failed", error);
    return true;
  }
}
