/**
 * Revocable living trust attorney planning draft from interview answers.
 * Conservative template only — not a valid trust; no invented statutes.
 */

import { TRUST_DISCLAIMER_TEXT } from "@/lib/trust-planner/constants";
import {
  US_STATE_OPTIONS,
  defaultTrustName,
  isCommunityPropertyState,
  type TrustAnswers,
} from "@/lib/trust-planner/questions";
import {
  TrustGenerateValidationError,
  validateTrustResiduePercents,
} from "@/lib/trust-planner/validate";

export const TRUST_DRAFT_PAGE_HEADER = "DRAFT — NOT A VALID TRUST";

export const TRUST_DRAFT_COVER_WARNING =
  "Take this to a licensed attorney. Do not sign this PDF as your trust unless that attorney adopts this exact paper.";

export type GenerateTrustDraftOptions = {
  linkedWillDraftId?: string | null;
};

export function trustDraftPageFooter(
  stateCode: string | null | undefined,
): string {
  const state = stateLabel(stateCode);
  return `Family Memory Vault trust planner draft. Not legal advice. Not valid until an attorney licensed in ${state} prepares the final instrument, you sign it as required, and assets are funded into the trust.`;
}

function stateLabel(code: string | null | undefined): string {
  if (!code?.trim()) return "[State]";
  return US_STATE_OPTIONS.find((s) => s.value === code)?.label ?? code;
}

function line(
  value: string | undefined | null,
  fallback = "[to be completed with counsel]",
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function entityLabel(code: string | undefined): string {
  switch (code) {
    case "sole_prop":
      return "sole proprietorship";
    case "llc":
      return "limited liability company";
    case "s_corp":
      return "S corporation";
    case "partnership":
      return "partnership";
    case "other":
      return "other business entity";
    default:
      return "[entity type]";
  }
}

function minorHoldSentence(answers: TrustAnswers): string {
  switch (answers.minorHoldAge) {
    case "outright":
      return "If a beneficiary is a minor, the planner asked for outright distribution (no age hold). Counsel should confirm whether a hold or trust sub-account is appropriate.";
    case "18":
    case "21":
    case "25":
    case "30":
      return `If a beneficiary is a minor, hold that beneficiary's share in trust until age ${answers.minorHoldAge}, then distribute outright unless counsel recommends otherwise.`;
    case "custom":
      return `If a beneficiary is a minor, hold that beneficiary's share in trust until age ${line(answers.minorHoldCustomAge, "[custom age]")}, then distribute outright unless counsel recommends otherwise.`;
    default:
      return "Minor holdback age: [to be confirmed with counsel].";
  }
}

function residueSection(answers: TrustAnswers): string[] {
  const out: string[] = [];
  if (answers.residueMode === "spouse_then_children") {
    out.push(
      "After specific gifts (if any), the residue of the trust estate passes to the grantor's spouse, if living; otherwise to the grantor's children in equal shares.",
    );
    out.push(
      "Plain-language planning note: spouse then children equally. Your attorney will adapt names and survivorship language.",
    );
  } else if (answers.residueMode === "specific_percents") {
    out.push(
      "After specific gifts (if any), the residue of the trust estate passes as follows:",
    );
    for (const share of answers.residueShares ?? []) {
      if (!share.name?.trim()) continue;
      out.push(`- ${share.name.trim()}: ${share.percent}%`);
    }
  } else {
    out.push("[Residue plan not yet chosen — complete the interview.]");
  }
  return out;
}

/** Attorney planning draft markdown — conservative; no statute citations. */
export function generateTrustDraftMarkdown(
  answers: TrustAnswers,
  options?: GenerateTrustDraftOptions,
): string {
  const residueCheck = validateTrustResiduePercents(answers);
  if (!residueCheck.ok) {
    throw new TrustGenerateValidationError(residueCheck.error);
  }

  const name = line(answers.fullLegalName, "[Full legal name]");
  const trustName = line(
    answers.trustName,
    defaultTrustName(answers.fullLegalName),
  );
  const city = line(answers.city, "[City]");
  const county = answers.county?.trim();
  const state = stateLabel(answers.stateCode);
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const out: string[] = [];

  // Page 1 / cover — disclaimer first
  out.push(TRUST_DRAFT_PAGE_HEADER);
  out.push("");
  out.push(TRUST_DRAFT_COVER_WARNING);
  out.push("");
  out.push(TRUST_DISCLAIMER_TEXT);
  out.push("");
  out.push("---");
  out.push("");
  out.push("REVOCABLE LIVING TRUST — ATTORNEY PLANNING DRAFT");
  out.push("");
  out.push(`Generated: ${generatedDate}`);
  out.push(`Domicile (planning): ${state}`);
  out.push("");
  out.push(
    "This document is a conservative planning outline for counsel review. It is not a trust, will, or legal advice. It does not cite or apply any statute.",
  );
  out.push("");

  out.push("## PARTIES");
  out.push(
    `Grantor / settlor: ${name}${answers.otherNamesUsed?.trim() ? ` (also known as ${answers.otherNamesUsed.trim()})` : ""}.`,
  );
  out.push(
    `Domicile: City of ${city}${county ? `, County of ${county},` : ","} State of ${state}.`,
  );
  const packs = answers.packs ?? {};
  if (packs.married && answers.spouseOrPartnerName?.trim()) {
    out.push(
      `Spouse or partner (planning): ${answers.spouseOrPartnerName.trim()}.`,
    );
    if (isCommunityPropertyState(answers.stateCode)) {
      out.push(
        "Planning note (community-property domicile): Ask your attorney how community and separate property should be described and whether a spouse must join in funding or signing.",
      );
    }
  }
  out.push("");

  out.push("## TRUST NAME");
  out.push(`Working title: ${trustName}.`);
  out.push(
    "Your attorney may rename the trust to match local practice and funding documents.",
  );
  out.push("");

  out.push("## INITIAL TRUSTEE");
  out.push(
    `${name} serves as the initial trustee. As grantor and initial trustee, you keep control of trust assets while you are competent to serve.`,
  );
  if (answers.hasCoTrustee === true) {
    out.push(
      `Optional co-trustee (while grantor serves): ${line(answers.coTrusteeName, "[Co-trustee name]")}.`,
    );
  }
  out.push("");

  out.push("## SUCCESSOR TRUSTEES");
  out.push(
    `If ${name} cannot serve as trustee, the successor trustee is ${line(answers.successorTrusteeName, "[Successor trustee]")}.`,
  );
  if (answers.alternateSuccessorTrusteeName?.trim()) {
    out.push(
      `If that successor cannot serve, the alternate successor trustee is ${answers.alternateSuccessorTrusteeName.trim()}.`,
    );
  } else {
    out.push(
      "Alternate successor trustee: [to be completed with counsel if desired].",
    );
  }
  out.push("");

  out.push("## LIFETIME");
  out.push(
    `During ${name}'s lifetime, the grantor may amend or revoke this revocable trust with the formalities your attorney directs.`,
  );
  out.push(
    "While competent, the grantor manages trust assets as initial trustee (and with any named co-trustee, if applicable).",
  );
  out.push(
    "This draft does not include irrevocable trust, tax, Crummey, or QTIP clauses.",
  );
  out.push("");

  out.push("## INCAPACITY");
  out.push(
    "If the grantor is incapacitated and cannot serve as trustee, the successor trustee manages trust assets under standard incapacity language your attorney will draft.",
  );
  out.push(
    "This planner does not define medical or legal incapacity — counsel will use appropriate standards for your state.",
  );
  if (answers.incapacityAcknowledged === true) {
    out.push("Planner acknowledged this approach.");
  }
  out.push("");

  const gifts = (answers.specificGifts ?? []).filter(
    (g) => g.item?.trim() || g.recipient?.trim(),
  );
  out.push("## SPECIFIC GIFTS");
  if (gifts.length === 0) {
    out.push(
      "None listed. If everything should follow the residue plan, no specific gifts are required.",
    );
  } else {
    out.push(
      "The grantor directs the following specific gifts, if owned at death:",
    );
    for (const g of gifts) {
      out.push(
        `- ${line(g.item, "[item]")} to ${line(g.recipient, "[recipient]")}.`,
      );
    }
    out.push(
      "If any gift cannot be made because the property is not part of the estate at death, counsel should advise whether the gift lapses.",
    );
  }
  out.push("");

  out.push("## RESIDUE");
  out.push(...residueSection(answers));
  if (options?.linkedWillDraftId) {
    out.push("");
    out.push(
      "Linked Will Planner draft: keep residue consistent with the will planner; your attorney should align both instruments.",
    );
  }
  out.push("");

  out.push("## MINOR HOLDBACK");
  out.push(minorHoldSentence(answers));
  if (answers.minorHoldNotes?.trim()) {
    out.push(`Planner notes: ${answers.minorHoldNotes.trim()}`);
  }
  out.push("");

  out.push("## WHAT THIS DRAFT DOES NOT DO");
  out.push(
    "- **Unfunded assets:** This paper does not retitle property or move accounts into the trust. Assets left outside the trust may pass by will, beneficiary form, or operation of law until funded.",
  );
  out.push(
    "- **Retirement titles:** IRAs, 401(k)s, and similar accounts usually stay in your name; beneficiary designation is often the primary lever. Ask counsel before naming the trust as beneficiary.",
  );
  out.push(
    "- **Business consents:** Operating agreements, buy-sell agreements, or entity rules may require consent before an interest is held in a trust. This draft does not obtain those consents.",
  );
  out.push(
    "- **Secrets:** Do not store passwords, seed phrases, or private keys in this draft. Use Digital Legacy notes for access instructions your attorney can reference separately.",
  );
  out.push("");

  if (packs.real_estate) {
    out.push("## PLANNING NOTE — Real estate (addresses only)");
    const addrs = (answers.realEstateAddresses ?? []).filter((a) =>
      a.address?.trim(),
    );
    if (addrs.length === 0) {
      out.push("[No addresses listed.]");
    } else {
      for (const a of addrs) {
        out.push(`- ${a.address.trim()}`);
      }
    }
    out.push("Funding (deed retitle) is a separate step with counsel.");
    out.push("");
  }

  if (packs.bank_brokerage) {
    out.push("## PLANNING NOTE — Bank / brokerage");
    out.push(
      line(
        answers.bankBrokerageNotes,
        "[Institutions in plain English — no account numbers]",
      ),
    );
    out.push("");
  }

  if (packs.retirement) {
    out.push("## PLANNING NOTE — Retirement / life insurance");
    out.push(
      "Usually stay in your name; beneficiary form is the lever — ask attorney before naming the trust on an IRA.",
    );
    if (answers.retirementLifeInsuranceNotes?.trim()) {
      out.push(answers.retirementLifeInsuranceNotes.trim());
    }
    out.push("");
  }

  if (packs.business) {
    out.push("## PLANNING NOTE — Business");
    out.push(`Name: ${line(answers.businessName, "[Business name]")}`);
    out.push(`Entity type: ${entityLabel(answers.businessEntityType)}`);
    if (answers.businessOperatingAgreementConsent === true) {
      out.push(
        "Flag: operating agreement or buy-sell may require consent to transfer into a trust — attorney to confirm.",
      );
    }
    out.push("");
  }

  if (packs.crypto) {
    out.push("## PLANNING NOTE — Crypto / digital assets");
    out.push(
      "No keys or passwords in this draft. Describe holdings at a high level; secrets belong in Digital Legacy notes.",
    );
    if (answers.cryptoDigitalNotes?.trim()) {
      out.push(answers.cryptoDigitalNotes.trim());
    }
    out.push("");
  }

  out.push("## POUR-OVER WILL COMPANION");
  if (answers.wantsPourOverWill === true) {
    out.push(
      "Planner indicated interest in a pour-over will to catch assets not yet funded into the trust.",
    );
    if (answers.pourOverNotes?.trim()) {
      out.push(answers.pourOverNotes.trim());
    }
    out.push(
      "Use Will Planner for a companion draft; counsel should align both instruments.",
    );
  } else if (answers.wantsPourOverWill === false) {
    out.push("No pour-over will companion indicated at this time.");
  } else {
    out.push("[Pour-over preference not yet answered.]");
  }
  out.push("");

  out.push("---");
  out.push("");
  out.push(trustDraftPageFooter(answers.stateCode));
  out.push("");
  out.push(
    "STILL NOT A VALID TRUST. An attorney licensed in your state must prepare the executable instrument, you must sign with required formalities, and you must fund the trust by retitling assets or updating beneficiary designations.",
  );

  return out.join("\n");
}

export function generateTrustDraftPlainText(
  answers: TrustAnswers,
  options?: GenerateTrustDraftOptions,
): string {
  return generateTrustDraftMarkdown(answers, options)
    .replace(/\*\*/g, "")
    .replace(/^>\s*/gm, "");
}
