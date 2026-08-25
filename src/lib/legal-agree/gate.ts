/**
 * Combined Beta NDA + Terms of Service acceptance gate.
 * One screen (/legal-agree) records both document versions when required.
 * Shown after the First Family Movie ritual (when eligible), before the vault.
 */

import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";
import { shouldRedirectToTerms } from "@/lib/terms/gate";
import { isBetaNdaRequired } from "@/lib/beta-nda/constants";
import { isTermsRequired } from "@/lib/terms/constants";

export const LEGAL_AGREE_PATH = "/legal-agree" as const;

/** True when either required legal document still needs acceptance. */
export async function shouldRedirectToLegalAgree(
  userId: string,
): Promise<boolean> {
  if (!isBetaNdaRequired() && !isTermsRequired()) return false;
  return (
    (await shouldRedirectToBetaNda(userId)) ||
    (await shouldRedirectToTerms(userId))
  );
}

export function isAnyLegalAgreementRequired(): boolean {
  return isBetaNdaRequired() || isTermsRequired();
}
