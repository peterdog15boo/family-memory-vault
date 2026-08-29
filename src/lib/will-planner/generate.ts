/**
 * Generate plain-language attorney draft markdown from interview answers.
 * Conservative template language — not an executed will.
 */

import {
  WILL_DISCLAIMER_TEXT,
  WILL_DISCLAIMER_VERSION,
} from "@/lib/will-planner/constants";
import {
  US_STATE_OPTIONS,
  hasAnyChildren,
  hasMinors,
  type ChildRelation,
  type WillAnswers,
} from "@/lib/will-planner/questions";
import {
  WillGenerateValidationError,
  validateResiduePercents,
} from "@/lib/will-planner/validate";

function stateLabel(code: string | undefined): string {
  if (!code) return "[state not provided]";
  return US_STATE_OPTIONS.find((s) => s.value === code)?.label ?? code;
}

function maritalLabel(status: WillAnswers["maritalStatus"]): string {
  switch (status) {
    case "married":
      return "married";
    case "domestic_partner":
      return "in a domestic partnership";
    case "separated":
      return "separated";
    case "divorced":
      return "divorced";
    case "widowed":
      return "widowed";
    case "single":
      return "single";
    default:
      return "of status not specified";
  }
}

function line(
  value: string | undefined | null,
  fallback = "[to be completed]",
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function personLine(
  name: string | undefined,
  city?: string | undefined,
  relationship?: string | undefined,
): string {
  const parts = [line(name)];
  if (city?.trim()) parts.push(`of ${city.trim()}`);
  if (relationship?.trim()) parts.push(`(${relationship.trim()})`);
  return parts.join(" ");
}

function childRelationLabel(relation: ChildRelation | undefined): string {
  switch (relation) {
    case "mine":
      return "my child";
    case "spouse":
      return "spouse’s child";
    case "both":
      return "child of both";
    case "adopted":
      return "adopted";
    default:
      return "relation not specified";
  }
}

/**
 * Checklist for counsel / client after generating the draft.
 */
export const WILL_ATTORNEY_NEXT_STEPS: string[] = [
  "Schedule a review with an attorney licensed in your state of domicile.",
  "Bring this draft and a list of assets, debts, and account locations (do not email seed phrases or passwords).",
  "Ask about witnesses, notary, and any self-proving affidavit your state requires.",
  "Sign only with the formalities your attorney directs — this app does not provide e-sign or notarization.",
  "Store the executed original in a safe place; tell your personal representative where it is.",
  "Update after marriage, divorce, birth/adoption, death of a beneficiary, or major property changes.",
  "Review beneficiary designations on retirement accounts and life insurance — they often override a will.",
];

function executionChecklist(stateName: string): string[] {
  return [
    `Most states require two adult witnesses for a will executed in ${stateName}; requirements vary — your attorney will confirm what applies to you.`,
    "Some states allow a notarized self-proving affidavit so witnesses need not appear in probate court later. Your attorney will direct you.",
    "Do not sign this planning draft as if it were a will. Only sign instruments your attorney prepares, with the witnesses/notary your state requires.",
    "This app does not provide electronic signatures or in-app notarization.",
  ];
}

/**
 * Build draft markdown. Throws WillGenerateValidationError if residue percents are invalid.
 */
export function generateWillDraftMarkdown(answers: WillAnswers): string {
  const percentCheck = validateResiduePercents(answers);
  if (!percentCheck.ok) {
    throw new WillGenerateValidationError(percentCheck.error);
  }

  const name = line(answers.fullLegalName, "[Full legal name]");
  const otherNames = answers.otherNamesUsed?.trim();
  const city = line(answers.city, "[City]");
  const county = answers.county?.trim();
  const state = stateLabel(answers.stateCode);
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const children =
    hasAnyChildren(answers) && answers.children?.length
      ? answers.children.filter((c) => c.name?.trim())
      : [];

  const gifts =
    answers.specificGifts?.filter(
      (g) => g.item?.trim() && g.recipient?.trim(),
    ) ?? [];

  const packs = answers.packs ?? {};

  const sections: string[] = [
    `# Estate Planning Interview Draft`,
    ``,
    `## Cover`,
    ``,
    `**Document type:** Planning draft for attorney review — not an executed will`,
    `**Prepared for:** ${name}`,
    `**State of domicile (stated):** ${state}`,
    `**Date prepared:** ${generatedDate}`,
    `**Disclaimer version:** ${WILL_DISCLAIMER_VERSION}`,
    ``,
    `> ${WILL_DISCLAIMER_TEXT}`,
    ``,
    `This document uses conservative planning language. It does **not** revoke prior wills, create a trust, give tax advice, or cite statutes. An attorney licensed in your state must prepare and supervise any legally effective documents.`,
    ``,
    `---`,
    ``,
    `## Family and domicile`,
    ``,
    `I, **${name}**, currently residing in **${city}**${county ? `, ${county} County,` : ","} **${state}**, am preparing this planning draft to discuss with a licensed attorney.`,
  ];

  if (otherNames) {
    sections.push(``, `Other names used: **${otherNames}**.`);
  }

  sections.push(
    ``,
    `I am currently **${maritalLabel(answers.maritalStatus)}**.`,
  );

  if (
    answers.maritalStatus === "married" ||
    answers.maritalStatus === "domestic_partner" ||
    answers.maritalStatus === "separated"
  ) {
    sections.push(
      ``,
      `Spouse or partner’s legal name: **${line(answers.spouseLegalName)}**.`,
    );
  }

  if (answers.hadPriorMarriages === true) {
    sections.push(``, `I have had prior marriage(s).`);
  } else if (answers.hadPriorMarriages === false) {
    sections.push(``, `I have not had prior marriages.`);
  }

  if (answers.childrenStatus === "none") {
    sections.push(``, `I have no children at this time.`);
  } else if (children.length > 0) {
    sections.push(
      ``,
      answers.childrenStatus === "minors"
        ? `I have one or more minor children:`
        : `I have adult children:`,
      ...children.map((c) => {
        const bits = [c.name.trim()];
        if (c.dob?.trim()) bits.push(`DOB: ${c.dob.trim()}`);
        bits.push(childRelationLabel(c.relation));
        return `- ${bits.join(" — ")}`;
      }),
    );
  } else if (hasAnyChildren(answers)) {
    sections.push(
      ``,
      `I have children; names to be confirmed with counsel.`,
    );
  }

  sections.push(``, `## Fiduciaries`, ``);
  sections.push(
    `Personal representative (executor): **${personLine(answers.executorName, answers.executorCity, answers.executorRelationship)}**.`,
    `Alternate: **${personLine(answers.alternateExecutorName, answers.alternateExecutorCity, answers.alternateExecutorRelationship)}**.`,
  );

  if (answers.digitalExecutorMode === "same_as_executor") {
    sections.push(
      ``,
      `Digital executor: same as personal representative. This person may request vault/legacy access; passwords and keys must not appear in estate documents.`,
    );
  } else if (answers.digitalExecutorMode === "different") {
    sections.push(
      ``,
      `Digital executor: **${personLine(answers.digitalExecutorName, answers.digitalExecutorCity, answers.digitalExecutorRelationship)}**. This person may request vault/legacy access; do not write passwords here.`,
    );
  }

  if (hasMinors(answers)) {
    sections.push(
      ``,
      `## Guardians`,
      ``,
      `Preferred guardian for minor children: **${personLine(answers.guardianName, answers.guardianCity, answers.guardianRelationship)}**.`,
      `Alternate guardian: **${personLine(answers.alternateGuardianName, answers.alternateGuardianCity, answers.alternateGuardianRelationship)}**.`,
      ``,
      `_A court still decides guardianship. Counsel should confirm ages and the proper nomination form under ${state} law._`,
    );
  }

  sections.push(``, `## Specific gifts`, ``);
  if (gifts.length > 0) {
    sections.push(
      ...gifts.map(
        (g) => `- **${g.item.trim()}** to **${g.recipient.trim()}**`,
      ),
    );
  } else {
    sections.push(
      `No specific gifts listed. Residue plan below should control unless counsel advises otherwise.`,
    );
  }

  sections.push(``, `## Residue`, ``);
  switch (answers.residueMode) {
    case "spouse_then_children":
      sections.push(
        `Preference: all residuary estate to spouse; if spouse does not survive, to children equally.`,
      );
      break;
    case "children_only":
      sections.push(
        `Preference: residuary estate to children only, in equal shares.`,
      );
      break;
    case "specific_percents": {
      const shares = (answers.residueShares ?? []).filter((s) =>
        s.name?.trim(),
      );
      sections.push(
        `Preference: residuary estate divided as follows (percents total 100%):`,
        ...shares.map(
          (s) => `- **${s.name.trim()}**: ${s.percent}%`,
        ),
      );
      break;
    }
    case "own_words":
      sections.push(line(answers.residueOwnWords));
      break;
    default:
      sections.push(`[Residue preference to be completed with counsel.]`);
  }

  sections.push(``, `## Real property notes`, ``);
  if (answers.realEstateMode === "none") {
    sections.push(`No real estate noted in this interview.`);
  } else if (answers.realEstateMode === "homestead_only") {
    sections.push(
      `Homestead / primary home preference: **${line(answers.homesteadWhoShouldReceive)}**.`,
      ``,
      `_Reminder: deeds, titles, and how title is held may control over a will. Counsel should review ownership._`,
    );
  } else if (answers.realEstateMode === "additional") {
    sections.push(
      `Homestead preference: **${line(answers.homesteadWhoShouldReceive)}**.`,
      ``,
      `Additional properties (preferences only):`,
    );
    const props = (answers.additionalProperties ?? []).filter(
      (p) => p.address?.trim(),
    );
    if (props.length === 0) {
      sections.push(`- [Addresses to be completed]`);
    } else {
      sections.push(
        ...props.map(
          (p) =>
            `- **${p.address.trim()}** → ${line(p.whoShouldReceive)}`,
        ),
      );
    }
    sections.push(
      ``,
      `_Reminder: deeds and titles may control. Counsel should review how each property is titled._`,
    );
  } else {
    sections.push(`[Real estate preferences to be completed.]`);
  }

  if (packs.business) {
    sections.push(``, `## Business notes`, ``);
    const entities = (answers.businessEntityTypes ?? []).join(", ") || "[entity type TBD]";
    sections.push(
      `Business name: **${line(answers.businessName)}**.`,
      `Entity type(s) indicated: ${entities}.`,
      `Who should receive the ownership interest: **${line(answers.businessInterestRecipient)}**.`,
      `Who should run operations: **${line(answers.businessOperationsManager)}**.`,
    );
    if (answers.hasOperatingOrBuySell === true) {
      sections.push(
        `Client indicated an operating agreement or buy-sell exists.`,
      );
    } else if (answers.hasOperatingOrBuySell === false) {
      sections.push(
        `**Flag for counsel:** Client indicated no operating agreement / buy-sell. Attorney should draft business succession; a will alone is often not enough.`,
      );
    }
    if (answers.businessTransitionContact?.trim()) {
      sections.push(
        `Business transition contact: **${answers.businessTransitionContact.trim()}**.`,
      );
    }
  }

  if (packs.employee) {
    sections.push(``, `## Retirement / insurance reminders`, ``);
    sections.push(
      `Employer: **${line(answers.employerName)}**.`,
      ``,
      `Retirement plans notes:`,
      line(answers.retirementPlansNotes, "[none provided]"),
      ``,
      `Life insurance notes:`,
      line(answers.lifeInsuranceNotes, "[none provided]"),
      ``,
      `_Important: name beneficiaries ON THE ACCOUNT or policy. A will usually does not control retirement accounts or life insurance proceeds._`,
    );
  }

  if (packs.investor) {
    sections.push(``, `## Investor / rental notes`, ``);
    sections.push(
      `Brokerage / taxable accounts:`,
      line(answers.brokerageNotes, "[none provided]"),
      ``,
      `_Reminder: beneficiary or TOD designations on accounts often control instead of a will._`,
      ``,
      `Rental management preference: **${line(answers.rentalManagerName)}**.`,
      ``,
      `Rentals (preferences):`,
    );
    const rentals = (answers.rentalProperties ?? []).filter((p) =>
      p.address?.trim(),
    );
    if (rentals.length === 0) {
      sections.push(`- [none listed]`);
    } else {
      sections.push(
        ...rentals.map(
          (p) =>
            `- **${p.address.trim()}** → inherit: ${line(p.whoShouldReceive)}`,
        ),
      );
    }
  }

  if (packs.crypto) {
    sections.push(``, `## Digital assets notes (no secrets)`, ``);
    sections.push(
      `Holding type indicated: **${line(answers.cryptoHoldingTypes, "[not specified]")}**.`,
      ``,
      `Where instructions live (no keys/passwords in this draft):`,
      line(
        answers.cryptoInstructionsLocation,
        "[Point counsel to Digital Legacy private notes / Secure Items — do not put seed phrases here.]",
      ),
      ``,
      `Who may request access after death: **${line(answers.cryptoAccessRequester)}**.`,
      ``,
      `_Warning: putting keys or seed phrases in a will can expose them in probate. Never include them in this draft._`,
    );
  }

  sections.push(``, `## Pets`, ``);
  if (answers.petsMode === "caretaker") {
    sections.push(
      `Preferred pet caretaker: **${line(answers.petCaretakerName)}**.`,
    );
    if (answers.petCareAmount?.trim()) {
      sections.push(
        `Optional amount for care: **${answers.petCareAmount.trim()}**.`,
      );
    }
  } else if (answers.petsMode === "none") {
    sections.push(`No pet caretaker requested in this interview.`);
  } else {
    sections.push(`[Pets preference not specified.]`);
  }

  sections.push(``, `## Funeral wishes`, ``);
  if (answers.funeralWishes?.trim()) {
    sections.push(
      answers.funeralWishes.trim(),
      ``,
      `_Labeled as wishes — not binding in every state._`,
    );
  } else {
    sections.push(`No funeral wishes recorded in this interview.`);
  }

  if (packs.complexity) {
    sections.push(``, `## Complexity flags`, ``);
    if (answers.flagSpecialNeedsChild === true) {
      sections.push(
        `- **Special needs child:** Ask attorney about a supplemental needs trust; do not leave a large outright gift in this draft.`,
      );
    }
    if (answers.flagNonUsPropertyOrHeirs === true) {
      sections.push(
        `- **Non-US property or non-US heirs** flagged for counsel.`,
      );
    }
    if (answers.flagDisinherit === true) {
      sections.push(
        `- **Disinheritance concern:** ${line(answers.disinheritName)}. Attorney must draft this carefully.`,
      );
    }
    if (answers.flagLivingTrust === true) {
      sections.push(
        `- **Existing living trust:** Generate pour-over style coordination notes — not a substitute trust.`,
        ``,
        line(answers.livingTrustNotes, "[Trust details to discuss with counsel.]"),
      );
    }
  }

  sections.push(``, `## Questions for your attorney`, ``);
  if (answers.attorneyNotes?.trim()) {
    sections.push(answers.attorneyNotes.trim());
  } else {
    sections.push(`[No additional free-text notes.]`);
  }

  if (packs.business && answers.hasOperatingOrBuySell === false) {
    sections.push(
      ``,
      `- Please advise on business succession documents; client flagged no operating agreement / buy-sell.`,
    );
  }
  if (packs.crypto) {
    sections.push(
      `- Please advise on digital asset access without putting secrets in testamentary documents.`,
    );
  }
  if (answers.flagLivingTrust === true) {
    sections.push(
      `- Please coordinate any pour-over will with the existing living trust (documents not generated here).`,
    );
  }

  sections.push(
    ``,
    `## Execution checklist (high level — ${state})`,
    ``,
    ...executionChecklist(state).map((item, i) => `${i + 1}. ${item}`),
    ``,
    `---`,
    ``,
    `### What to do next with an attorney`,
    ``,
    ...WILL_ATTORNEY_NEXT_STEPS.map((item, i) => `${i + 1}. ${item}`),
    ``,
    `---`,
    ``,
    WILL_DISCLAIMER_TEXT,
  );

  return sections.join("\n");
}

/** Plain text export (same content, suitable for copy / .txt download). */
export function generateWillDraftPlainText(answers: WillAnswers): string {
  return generateWillDraftMarkdown(answers)
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^>\s*/gm, "");
}
