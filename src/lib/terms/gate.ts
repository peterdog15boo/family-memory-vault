/**
 * Layout/page helper: should we send this user to /terms-agree?
 */

import { cookies } from "next/headers";
import {
  TERMS_COOKIE,
  TERMS_VERSION,
  hasAcceptedTerms,
  isTermsRequired,
} from "@/lib/terms";

export async function shouldRedirectToTerms(
  userId: string,
): Promise<boolean> {
  if (!isTermsRequired()) return false;
  try {
    return !(await hasAcceptedTerms(userId));
  } catch (error) {
    console.error("[terms.gate] acceptance check failed", error);
    try {
      const cookieStore = await cookies();
      if (cookieStore.get(TERMS_COOKIE)?.value === TERMS_VERSION) {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  }
}
