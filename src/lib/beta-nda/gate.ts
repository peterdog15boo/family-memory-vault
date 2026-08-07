/**
 * Layout/page helper: should we send this user to /beta-agree?
 */

import { cookies } from "next/headers";
import {
  BETA_NDA_COOKIE,
  BETA_NDA_VERSION,
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
    console.error("[beta-nda.gate] acceptance check failed", error);
    // Honor the httpOnly acceptance cookie when DB reads fail transiently —
    // prevents /media ↔ /beta-agree redirect loops after a successful accept.
    try {
      const cookieStore = await cookies();
      if (cookieStore.get(BETA_NDA_COOKIE)?.value === BETA_NDA_VERSION) {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  }
}
