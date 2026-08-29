/**
 * Proforma LAST WILL AND TESTAMENT from interview answers.
 * Still a DRAFT for attorney review — not an executed will.
 */

import { WILL_DISCLAIMER_VERSION } from "@/lib/will-planner/constants";
import {
  US_STATE_OPTIONS,
  hasAnyChildren,
  hasMinors,
  type BusinessEntityType,
  type ChildRelation,
  type CryptoHoldingType,
  type WillAnswers,
} from "@/lib/will-planner/questions";
import {
  WillGenerateValidationError,
  validateResiduePercents,
} from "@/lib/will-planner/validate";

export const WILL_DRAFT_PAGE_HEADER = "DRAFT — NOT AN EXECUTED WILL";

export const WILL_DRAFT_COVER_WARNING =
  "Take this to a licensed attorney. Do not sign this PDF as your will unless that attorney adopts this exact paper.";

/** High-level next steps (UI / Ask AI) — not part of the instrument body. */
export const WILL_ATTORNEY_NEXT_STEPS: string[] = [
  "Schedule a review with an attorney licensed in your state of domicile.",
  "Bring this draft and a list of assets, debts, and account locations (do not email seed phrases or passwords).",
  "Ask about witnesses, notary, and any self-proving affidavit your state requires.",
  "Sign only with the formalities your attorney directs — this app does not provide e-sign or notarization.",
  "Store the executed original in a safe place; tell your personal representative where it is.",
  "Update after marriage, divorce, birth/adoption, death of a beneficiary, or major property changes.",
  "Review beneficiary designations on retirement accounts and life insurance — they often override a will.",
];

export function willDraftPageFooter(stateCode: string | null | undefined): string {
  const state = stateLabel(stateCode);
  return `Family Memory Vault planner draft. Not legal advice. Not valid until an attorney licensed in ${state} prepares the final instrument and you sign it with the witnesses/notary that state requires.`;
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

function personClause(
  name: string | undefined,
  city?: string | undefined,
  relationship?: string | undefined,
): string {
  const n = line(name);
  const bits: string[] = [n];
  if (city?.trim()) bits.push(`residing in ${city.trim()}`);
  if (relationship?.trim()) bits.push(`who is my ${relationship.trim()}`);
  return bits.join(", ");
}

function maritalSentence(answers: WillAnswers): string {
  switch (answers.maritalStatus) {
    case "married":
      return `I am married to ${line(answers.spouseLegalName, "[spouse’s legal name]")}.`;
    case "domestic_partner":
      return `I am in a domestic partnership with ${line(answers.spouseLegalName, "[partner’s legal name]")}.`;
    case "separated":
      return `I am separated from ${line(answers.spouseLegalName, "[spouse’s legal name]")}.`;
    case "divorced":
      return "I am divorced.";
    case "widowed":
      return "I am a widow / widower.";
    case "single":
      return "I am single and unmarried.";
    default:
      return "My marital status shall be confirmed with counsel.";
  }
}

function childRelationPhrase(relation: ChildRelation | undefined): string {
  switch (relation) {
    case "mine":
      return "my child";
    case "spouse":
      return "my spouse’s child";
    case "both":
      return "a child of both myself and my spouse";
    case "adopted":
      return "my adopted child";
    default:
      return "my child";
  }
}

function entityTypeLabel(t: BusinessEntityType): string {
  switch (t) {
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
      return t;
  }
}

function cryptoHoldingLabel(t: CryptoHoldingType | undefined): string {
  switch (t) {
    case "exchange":
      return "assets held on one or more exchanges";
    case "self_custody":
      return "self-custodied digital assets";
    case "both":
      return "both exchange-held and self-custodied digital assets";
    default:
      return "digital assets of a type to be confirmed with counsel";
  }
}

function pushBlank(out: string[]) {
  out.push("");
}

/**
 * Build proforma will markdown. Throws if residue percents are invalid.
 */
export function generateWillDraftMarkdown(answers: WillAnswers): string {
  const percentCheck = validateResiduePercents(answers);
  if (!percentCheck.ok) {
    throw new WillGenerateValidationError(percentCheck.error);
  }

  const name = line(answers.fullLegalName, "[FULL LEGAL NAME]").toUpperCase();
  const displayName = line(answers.fullLegalName, "[Full legal name]");
  const city = line(answers.city, "[City]");
  const county = answers.county?.trim();
  const stateCode = answers.stateCode?.trim() || "";
  const state = stateLabel(stateCode);
  const packs = answers.packs ?? {};
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

  const out: string[] = [];

  // —— Cover sheet ——
  out.push(WILL_DRAFT_PAGE_HEADER);
  pushBlank(out);
  out.push("COVER SHEET — PLANNING DRAFT FOR ATTORNEY REVIEW");
  pushBlank(out);
  out.push(WILL_DRAFT_COVER_WARNING);
  pushBlank(out);
  out.push(
    `Prepared for: ${displayName}`,
    `Stated domicile: ${city}${county ? `, ${county} County,` : ","} ${state}`,
    `Date prepared: ${generatedDate}`,
    `Disclaimer version: ${WILL_DISCLAIMER_VERSION}`,
  );
  pushBlank(out);
  out.push(willDraftPageFooter(stateCode));
  pushBlank(out);
  out.push("— End of cover sheet —");
  pushBlank(out);
  out.push("─".repeat(40));
  pushBlank(out);

  // —— Title & opening ——
  out.push(`LAST WILL AND TESTAMENT OF ${name}`);
  pushBlank(out);
  out.push(
    `I, ${displayName}${answers.otherNamesUsed?.trim() ? `, also known as ${answers.otherNamesUsed.trim()},` : ""}, of the City of ${city}${county ? `, County of ${county},` : ","} State of ${state}, being of sound mind and disposing memory, do hereby make, publish, and declare this to be my Last Will and Testament.`,
  );
  pushBlank(out);
  out.push(
    `Proposed language for attorney review — Revocation of prior wills: I hereby revoke all former wills and codicils previously made by me. (An attorney licensed in ${state} must confirm whether this clause, as adapted, should appear in the executable instrument.)`,
  );

  // —— Article I ——
  pushBlank(out);
  out.push("ARTICLE I — IDENTITY AND FAMILY");
  pushBlank(out);
  out.push(
    `I am ${displayName}. ${maritalSentence(answers)}`,
  );
  if (answers.hadPriorMarriages === true) {
    out.push(
      "I have had one or more prior marriages. My attorney should confirm any obligations arising from those marriages.",
    );
  } else if (answers.hadPriorMarriages === false) {
    out.push("I have not had any prior marriages.");
  }

  if (answers.childrenStatus === "none") {
    out.push("I have no children living at the time of making this draft.");
  } else if (children.length > 0) {
    out.push(
      answers.childrenStatus === "minors"
        ? "I have the following minor child or children:"
        : "I have the following child or children:",
    );
    for (const c of children) {
      const bits = [`${c.name.trim()}, ${childRelationPhrase(c.relation)}`];
      if (c.dob?.trim()) bits.push(`date of birth ${c.dob.trim()}`);
      out.push(`I identify ${bits.join(", ")}.`);
    }
  } else if (hasAnyChildren(answers)) {
    out.push(
      "I have children; their names and dates of birth shall be confirmed with counsel before any instrument is signed.",
    );
  }

  // —— Article II ——
  pushBlank(out);
  out.push("ARTICLE II — PERSONAL REPRESENTATIVE / EXECUTOR");
  pushBlank(out);
  out.push(
    `I nominate and appoint ${personClause(answers.executorName, answers.executorCity, answers.executorRelationship)} to serve as Independent Executor / Personal Representative of my estate.`,
  );
  out.push(
    `If my first nominee is unable or unwilling to serve, I nominate ${personClause(answers.alternateExecutorName, answers.alternateExecutorCity, answers.alternateExecutorRelationship)} as alternate.`,
  );
  out.push(
    `Proposed language for attorney review (state-dependent — attorney to confirm): I direct that my Independent Executor / Personal Representative serve without bond and with independent administration to the fullest extent permitted by the law of ${state}.`,
  );

  // —— Article III (minors only) ——
  if (hasMinors(answers)) {
    pushBlank(out);
    out.push("ARTICLE III — GUARDIAN OF MINORS");
    pushBlank(out);
    out.push(
      `If at my death I am survived by a minor child or children, I nominate ${personClause(answers.guardianName, answers.guardianCity, answers.guardianRelationship)} to serve as guardian of the person of such minor child or children.`,
    );
    out.push(
      `If that nominee is unable or unwilling to serve, I nominate ${personClause(answers.alternateGuardianName, answers.alternateGuardianCity, answers.alternateGuardianRelationship)} as alternate guardian.`,
    );
    out.push(
      `I understand that a court of competent jurisdiction must approve any guardianship nomination under the law of ${state}.`,
    );
  }

  // —— Article IV (gifts only if any) ——
  if (gifts.length > 0) {
    pushBlank(out);
    out.push("ARTICLE IV — SPECIFIC GIFTS");
    pushBlank(out);
    out.push(
      "I give, devise, and bequeath the following specific gifts, if owned by me at my death:",
    );
    pushBlank(out);
    out.push("Item | Recipient");
    out.push("-----|----------");
    for (const g of gifts) {
      out.push(`${g.item.trim()} | ${g.recipient.trim()}`);
    }
    pushBlank(out);
    out.push(
      "If any specific gift cannot be made because the property is not part of my estate at death, that gift shall lapse unless my attorney provides otherwise.",
    );
  }

  // —— Article V ——
  pushBlank(out);
  out.push("ARTICLE V — RESIDUARY ESTATE");
  pushBlank(out);
  switch (answers.residueMode) {
    case "spouse_then_children":
      out.push(
        `I give, devise, and bequeath all the rest, residue, and remainder of my estate, of whatever kind and wherever situated, to my spouse, if my spouse survives me. If my spouse does not survive me, I give said residuary estate to my children who survive me, in equal shares, share and share alike, with the issue of any deceased child taking per stirpes the share such child would have taken if living (or as my attorney otherwise adapts under ${state} law).`,
      );
      break;
    case "children_only":
      out.push(
        `I give, devise, and bequeath all the rest, residue, and remainder of my estate to my children who survive me, in equal shares, share and share alike, with the issue of any deceased child taking per stirpes (or as my attorney otherwise adapts under ${state} law).`,
      );
      break;
    case "specific_percents": {
      const shares = (answers.residueShares ?? []).filter((s) =>
        s.name?.trim(),
      );
      out.push(
        "I give, devise, and bequeath all the rest, residue, and remainder of my estate as follows:",
      );
      for (const s of shares) {
        out.push(
          `I give ${s.percent} percent (${s.percent}%) of my residuary estate to ${s.name.trim()}.`,
        );
      }
      break;
    }
    case "own_words":
      out.push(
        `As to my residuary estate, I direct as follows (proposed language for attorney review): ${line(answers.residueOwnWords)}.`,
      );
      break;
    default:
      out.push(
        `My residuary disposition shall be completed with counsel licensed in ${state}.`,
      );
  }

  // —— Article VI (real property / investor rentals) ——
  const rentals =
    packs.investor
      ? (answers.rentalProperties ?? []).filter((p) => p.address?.trim())
      : [];
  const additional =
    answers.realEstateMode === "additional"
      ? (answers.additionalProperties ?? []).filter((p) => p.address?.trim())
      : [];
  const includeRealProperty =
    answers.realEstateMode === "homestead_only" ||
    answers.realEstateMode === "additional" ||
    rentals.length > 0;

  if (includeRealProperty) {
    pushBlank(out);
    out.push("ARTICLE VI — REAL PROPERTY NOTES");
    pushBlank(out);
    if (
      answers.realEstateMode === "homestead_only" ||
      answers.realEstateMode === "additional"
    ) {
      out.push(
        `As to my homestead or primary residence, it is my wish that ${line(answers.homesteadWhoShouldReceive)} receive that property, subject to how title is held and to counsel’s advice.`,
      );
    }
    for (const p of additional) {
      out.push(
        `As to the real property located at ${p.address.trim()}, it is my wish that ${line(p.whoShouldReceive)} receive that property.`,
      );
    }
    for (const p of rentals) {
      out.push(
        `As to the rental property located at ${p.address.trim()}, it is my wish that ${line(p.whoShouldReceive)} receive that property.`,
      );
    }
    if (packs.investor && answers.rentalManagerName?.trim()) {
      out.push(
        `I request that ${answers.rentalManagerName.trim()} be consulted regarding management of rental property during administration, if appropriate.`,
      );
    }
    out.push(
      "Title, deed, and how property is held may control over this will. Attorney to align these wishes with actual ownership and any transfer-on-death deeds.",
    );
  }

  // —— Article VII (business pack) ——
  if (packs.business) {
    pushBlank(out);
    out.push("ARTICLE VII — BUSINESS INTERESTS");
    pushBlank(out);
    const entities = (answers.businessEntityTypes ?? [])
      .map(entityTypeLabel)
      .join("; ");
    out.push(
      `I own or may own an interest in ${line(answers.businessName)}${entities ? `, organized or operated as: ${entities}` : ""}.`,
    );
    out.push(
      `I give, devise, and bequeath my ownership interest in said business to ${line(answers.businessInterestRecipient)}, to the extent such interest is transferable by will.`,
    );
    out.push(
      `It is my wish that ${line(answers.businessOperationsManager)} be considered to operate or oversee day-to-day operations of the business after my death, distinct from who may receive ownership, unless my attorney structures this differently.`,
    );
    if (answers.hasOperatingOrBuySell === true) {
      out.push(
        "I have indicated that an operating agreement or buy-sell agreement may exist.",
      );
    } else if (answers.hasOperatingOrBuySell === false) {
      out.push(
        "I have indicated that I do not currently have an operating agreement or buy-sell agreement. My attorney should advise on succession documents.",
      );
    }
    if (answers.businessTransitionContact?.trim()) {
      out.push(
        `For transition questions, counsel or my personal representative may contact ${answers.businessTransitionContact.trim()}.`,
      );
    }
    out.push(
      "Operating agreement / buy-sell may override this article. Attorney must review books and consents.",
    );
  }

  // —— Article VIII (employee / investor packs) ——
  if (packs.employee || packs.investor) {
    pushBlank(out);
    out.push("ARTICLE VIII — RETIREMENT, LIFE INSURANCE, TOD/POD");
    pushBlank(out);
    if (packs.employee) {
      out.push(
        `I am or have been employed by ${line(answers.employerName)}.`,
      );
      out.push(
        `Regarding retirement plans, I have stated: ${line(answers.retirementPlansNotes, "details to be confirmed with counsel")}.`,
      );
      out.push(
        `Regarding life insurance, I have stated: ${line(answers.lifeInsuranceNotes, "details to be confirmed with counsel")}.`,
      );
    }
    if (packs.investor) {
      out.push(
        `Regarding brokerage or taxable investment accounts, I have stated: ${line(answers.brokerageNotes, "details to be confirmed with counsel")}.`,
      );
    }
    out.push(
      "**These accounts usually pass by beneficiary form, not by this will.** I direct my personal representative and counsel to confirm and, where appropriate, update beneficiary, TOD, and POD designations so they reflect my overall plan.",
    );
  }

  // —— Article IX (crypto pack) ——
  if (packs.crypto) {
    pushBlank(out);
    out.push("ARTICLE IX — DIGITAL ASSETS AND CRYPTOCURRENCY");
    pushBlank(out);
    out.push(
      `I may own ${cryptoHoldingLabel(answers.cryptoHoldingTypes)}.`,
    );
    out.push(
      `Instructions concerning the location of access information (without secrets) may be found as follows: ${line(answers.cryptoInstructionsLocation, "see Digital Legacy private notes — never seed phrases in this will")}.`,
    );
    const digitalRep =
      answers.digitalExecutorMode === "different"
        ? personClause(
            answers.digitalExecutorName,
            answers.digitalExecutorCity,
            answers.digitalExecutorRelationship,
          )
        : personClause(
            answers.executorName,
            answers.executorCity,
            answers.executorRelationship,
          );
    out.push(
      `I nominate ${digitalRep} to act as my digital / personal representative with respect to digital assets, to the extent permitted by law, and I authorize that person to request access consistent with applicable statutes.`,
    );
    if (answers.cryptoAccessRequester?.trim()) {
      out.push(
        `I have indicated that ${answers.cryptoAccessRequester.trim()} may also request access after my death, subject to counsel’s advice and applicable law.`,
      );
    }
    out.push(
      "Private keys, seed phrases, and passwords must NOT appear in this will. Store those only in Digital Legacy private notes.",
    );
  }

  // —— Article X (pets) ——
  if (answers.petsMode === "caretaker") {
    pushBlank(out);
    out.push("ARTICLE X — PETS");
    pushBlank(out);
    out.push(
      `I request that ${line(answers.petCaretakerName)} care for any pets I own at my death.`,
    );
    if (answers.petCareAmount?.trim()) {
      out.push(
        `I authorize my personal representative to deliver up to ${answers.petCareAmount.trim()} to that caretaker for the care of such pets, if my estate can do so and my attorney confirms the proper form of gift.`,
      );
    }
  }

  // —— Article XI (funeral) ——
  if (answers.funeralWishes?.trim()) {
    pushBlank(out);
    out.push("ARTICLE XI — FUNERAL / DISPOSITION WISHES");
    pushBlank(out);
    out.push(
      `It is my wish, labeled non-binding in many states, that: ${answers.funeralWishes.trim()}`,
    );
    out.push(
      "My personal representative and family should treat these wishes with respect, understanding they may not be legally binding in every jurisdiction.",
    );
  }

  // —— Article XII ——
  pushBlank(out);
  out.push("ARTICLE XII — MISCELLANEOUS PROPOSED CLAUSES FOR ATTORNEY");
  pushBlank(out);
  out.push(
    `Survivorship: Proposed language for attorney review — Unless my attorney directs otherwise, a beneficiary must survive me by thirty (30) days to take under this will.`,
  );
  out.push(
    "Severability: Proposed language for attorney review — If any provision of this will is held invalid, the remaining provisions shall continue in full force and effect.",
  );
  out.push(
    `Governing law: Proposed language for attorney review — This will shall be governed by the laws of the State of ${state}.`,
  );

  if (
    !packs.crypto &&
    (answers.digitalExecutorMode === "same_as_executor" ||
      answers.digitalExecutorMode === "different")
  ) {
    const digitalRep =
      answers.digitalExecutorMode === "different"
        ? personClause(
            answers.digitalExecutorName,
            answers.digitalExecutorCity,
            answers.digitalExecutorRelationship,
          )
        : personClause(
            answers.executorName,
            answers.executorCity,
            answers.executorRelationship,
          );
    out.push(
      `Digital access: I nominate ${digitalRep} to request access to digital accounts after my death to the extent permitted by law. Passwords and keys must not appear in this will.`,
    );
  }

  if (packs.complexity) {
    if (answers.flagSpecialNeedsChild === true) {
      out.push(
        "Complexity flag for counsel: a child may have special needs — ask about a supplemental needs trust; do not leave a large outright gift solely because of this draft.",
      );
    }
    if (answers.flagNonUsPropertyOrHeirs === true) {
      out.push(
        "Complexity flag for counsel: non-U.S. property or non-U.S. heirs may be involved.",
      );
    }
    if (answers.flagDisinherit === true) {
      out.push(
        `Complexity flag for counsel: possible disinheritance concern regarding ${line(answers.disinheritName)}. Attorney must draft carefully.`,
      );
    }
    if (answers.flagLivingTrust === true) {
      out.push(
        `Complexity flag for counsel: an existing living trust may require pour-over coordination. Notes: ${line(answers.livingTrustNotes)}.`,
      );
    }
  }

  if (answers.attorneyNotes?.trim()) {
    out.push(
      `Additional notes for attorney review: ${answers.attorneyNotes.trim()}`,
    );
  }

  // —— Closing / sample execution ——
  pushBlank(out);
  out.push("─".repeat(40));
  pushBlank(out);
  out.push(
    "SAMPLE EXECUTION BLOCK — do not complete until your attorney says this is the signing set.",
  );
  pushBlank(out);

  if (stateCode === "LA") {
    out.push(
      "LOUISIANA NOTE: Louisiana generally uses a notarial testament (notary + two witnesses) or an olographic (fully handwritten) form — not a simple common-law two-friend witnessing ceremony. Your Louisiana attorney must prepare the executable ceremony. Do not treat this sample block as sufficient for Louisiana.",
    );
    pushBlank(out);
    out.push(
      "IN WITNESS WHEREOF, I have set my hand to this planning draft for discussion with counsel on this ____ day of ______________, 20____.",
    );
    pushBlank(out);
    out.push("_________________________________");
    out.push(`${displayName}, Testator (sample only — do not sign as a will)`);
    pushBlank(out);
    out.push(
      "Notarial testament formalities (notary + two witnesses) to be supplied by counsel — not printed here as an executable form.",
    );
  } else {
    out.push(
      "IN WITNESS WHEREOF, I have hereunto set my hand and declare this instrument to be my Last Will and Testament (planning draft) on this ____ day of ______________, 20____.",
    );
    pushBlank(out);
    out.push("_________________________________");
    out.push(`${displayName}, Testator`);
    pushBlank(out);
    out.push(
      "The foregoing instrument was signed, published, and declared by the Testator as the Testator’s Last Will and Testament in our presence, and we, at the Testator’s request and in the Testator’s presence and in the presence of each other, have signed our names as witnesses on this ____ day of ______________, 20____.",
    );
    pushBlank(out);
    out.push("Witness 1: _______________________________  Address: ____________________");
    pushBlank(out);
    out.push("Witness 2: _______________________________  Address: ____________________");
    pushBlank(out);
    out.push(
      "SELF-PROVING / NOTARY EXHIBIT (sample): A self-proving affidavit, if used, is typically a separate exhibit completed before a notary at the signing. Attorney to supply the form required in this state.",
    );
    if (stateCode === "TX") {
      pushBlank(out);
      out.push(
        "TEXAS NOTE: A Texas self-proving affidavit is separate from the will and is strongly recommended at the signing. A notary is not a substitute for the two required witnesses.",
      );
    }
  }

  pushBlank(out);
  out.push("─".repeat(40));
  pushBlank(out);
  out.push(willDraftPageFooter(stateCode));

  return out.join("\n");
}

/** Plain text export for PDF / DOCX / copy. */
export function generateWillDraftPlainText(answers: WillAnswers): string {
  return generateWillDraftMarkdown(answers)
    .replace(/\*\*/g, "")
    .replace(/^>\s*/gm, "");
}
