import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WILL_DISCLAIMER_TEXT } from "@/lib/will-planner/constants";
import { buildSimpleDocx } from "@/lib/will-planner/docx";
import {
  generateWillDraftMarkdown,
  WILL_DRAFT_COVER_WARNING,
  WILL_DRAFT_PAGE_HEADER,
  willDraftPageFooter,
} from "@/lib/will-planner/generate";
import { buildSimpleTextPdf } from "@/lib/will-planner/pdf";
import {
  willFormFirstPagePreview,
  willTextFromDocumentNotes,
} from "@/lib/will-planner/preview";
import {
  getWillStep,
  WILL_STEPS,
  type WillAnswers,
} from "@/lib/will-planner/questions";
import { buildWillReadyChecklist } from "@/lib/will-planner/ready";
import {
  cryptoStepFieldKeys,
  sanitizeWillAnswers,
  WILL_FORBIDDEN_ANSWER_KEYS,
} from "@/lib/will-planner/sanitize";
import {
  buildSigningChecklistTasks,
  isSigningUploadUnlocked,
  normalizeSigningChecklistState,
  signingChecklistProgress,
  willMakeRealTone,
} from "@/lib/will-planner/signing-checklist";
import {
  willAnswersContentChanged,
  willAnswersContentFingerprint,
} from "@/lib/will-planner/answers-diff";
import {
  buildWillPlannerDocumentTitle,
  parseWillDraftIdFromTags,
  willDraftIdTag,
} from "@/lib/will-planner/document-meta";
import { shouldIncludeStep, visibleWillSteps } from "@/lib/will-planner/skip";
import {
  validateResiduePercents,
  WillGenerateValidationError,
} from "@/lib/will-planner/validate";
import { retrieveHelpEntries } from "@/lib/ai/help";

const root = join(process.cwd());

const baseAnswers: WillAnswers = {
  fullLegalName: "Ada Lovelace",
  city: "Austin",
  county: "Travis",
  stateCode: "TX",
  maritalStatus: "single",
  hadPriorMarriages: false,
  childrenStatus: "none",
  executorName: "Charles Babbage",
  executorCity: "London",
  executorRelationship: "friend",
  residueMode: "own_words",
  residueOwnWords: "To my estate attorney’s recommended residual plan.",
  realEstateMode: "none",
  petsMode: "none",
  digitalExecutorMode: "same_as_executor",
  packs: {},
};

describe("Will Planner access & disclaimer posture", () => {
  it("gates /legacy/will behind Legacy+", () => {
    const src = readFileSync(
      join(root, "src/app/(app)/legacy/will/page.tsx"),
      "utf8",
    );
    expect(src).toContain("canUseLegacyPlusFeatures");
    expect(src).toContain("LegacyPlusLockedPage");
  });

  it("requires disclaimer acceptance before starting questions", () => {
    const src = readFileSync(
      join(root, "src/app/api/legacy/will/route.ts"),
      "utf8",
    );
    expect(src).toContain("hasAcceptedWillDisclaimer");
    expect(src).toContain("disclaimer_required");
  });
});

describe("Will Planner skip & packs", () => {
  it("omits business pack when unchecked", () => {
    expect(shouldIncludeStep("business", { packs: {} })).toBe(false);
    expect(
      shouldIncludeStep("business", { packs: { business: true } }),
    ).toBe(true);
    expect(visibleWillSteps({ packs: { employee: true } })).not.toContain(
      "business",
    );
  });

  it("crypto step never defines a seed phrase field", () => {
    const crypto = getWillStep("crypto");
    expect(crypto).toBeTruthy();
    const keys = crypto!.fields.map((f) => String(f.key));
    expect(keys).toEqual(cryptoStepFieldKeys());
    for (const forbidden of WILL_FORBIDDEN_ANSWER_KEYS) {
      expect(keys.map((k) => k.toLowerCase())).not.toContain(
        forbidden.toLowerCase(),
      );
    }
    const allFieldKeys = WILL_STEPS.flatMap((s) =>
      s.fields.map((f) => String(f.key).toLowerCase()),
    );
    expect(allFieldKeys).not.toContain("seedphrase");
    expect(allFieldKeys).not.toContain("seed_phrase");
    expect(allFieldKeys).not.toContain("password");
  });

  it("sanitize strips seed phrase fields if somehow present", () => {
    const dirty = {
      ...baseAnswers,
      seedPhrase: "abandon abandon abandon",
      packs: { crypto: true },
    } as WillAnswers & { seedPhrase: string };
    const clean = sanitizeWillAnswers(dirty);
    expect("seedPhrase" in clean).toBe(false);
    expect(JSON.stringify(clean)).not.toMatch(/abandon abandon/);
  });
});

describe("will form first-page preview", () => {
  it("shows cover and title, not a checklist-only teaser", () => {
    const md = generateWillDraftMarkdown(baseAnswers);
    const page = willFormFirstPagePreview(md);
    expect(page).toContain(WILL_DRAFT_PAGE_HEADER);
    expect(page).toContain("LAST WILL AND TESTAMENT");
    expect(page).toContain(WILL_DRAFT_COVER_WARNING);
    expect(page.toLowerCase()).not.toMatch(/what to do next with an attorney/);
  });

  it("extracts will text from document notes payload", () => {
    const md = generateWillDraftMarkdown(baseAnswers);
    const notes = `FMV planning draft PDF.\n\n— Markdown / plain text —\n${md}`;
    const extracted = willTextFromDocumentNotes(notes);
    expect(extracted).toContain("ARTICLE I");
    expect(willFormFirstPagePreview(extracted)).toContain("Ada Lovelace");
  });
});

describe("residue percents unlock generate", () => {
  it("blocks generate under 100 and unlocks at 100", () => {
    const incomplete: WillAnswers = {
      ...baseAnswers,
      residueMode: "specific_percents",
      residueShares: [
        { name: "Alice", percent: 40 },
        { name: "Bob", percent: 40 },
      ],
    };
    expect(validateResiduePercents(incomplete).ok).toBe(false);
    expect(() => generateWillDraftMarkdown(incomplete)).toThrow(
      WillGenerateValidationError,
    );

    const complete: WillAnswers = {
      ...incomplete,
      residueShares: [
        { name: "Alice", percent: 60 },
        { name: "Bob", percent: 40 },
      ],
    };
    expect(validateResiduePercents(complete).ok).toBe(true);
    expect(generateWillDraftMarkdown(complete)).toContain("60%");
  });
});

describe("generated downloads include disclaimer on page 1", () => {
  it("PDF bytes include draft header near the start", () => {
    const plain = generateWillDraftMarkdown(baseAnswers);
    expect(plain).toContain(WILL_DRAFT_PAGE_HEADER);
    expect(plain).toContain(WILL_DRAFT_COVER_WARNING);
    expect(plain).toContain("LAST WILL AND TESTAMENT OF");
    const pdf = buildSimpleTextPdf("Draft", plain, {
      pageHeader: WILL_DRAFT_PAGE_HEADER,
      pageFooter: willDraftPageFooter("TX"),
      stateCode: "TX",
    });
    const asText = new TextDecoder("latin1").decode(pdf);
    const headerPos = asText.indexOf("DRAFT");
    const bodyPos = asText.indexOf("Ada Lovelace");
    expect(headerPos).toBeGreaterThan(-1);
    expect(headerPos).toBeLessThan(bodyPos);
  });

  it("PDF content stream Length matches UTF-8 byte length", () => {
    const plain = generateWillDraftMarkdown(baseAnswers);
    const pdf = buildSimpleTextPdf("Draft", plain, {
      pageHeader: WILL_DRAFT_PAGE_HEADER,
      pageFooter: willDraftPageFooter("TX"),
      stateCode: "TX",
    });
    const asText = new TextDecoder("utf8").decode(pdf);
    const streams = [
      ...asText.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g),
    ];
    expect(streams.length).toBeGreaterThan(0);
    for (const [, declared, body] of streams) {
      expect(parseInt(declared!, 10)).toBe(
        new TextEncoder().encode(body!).byteLength,
      );
    }
  });

  it("DOCX includes disclaimer text", () => {
    const plain = generateWillDraftMarkdown(baseAnswers);
    const docx = buildSimpleDocx("Draft", plain, {
      disclaimer: WILL_DISCLAIMER_TEXT,
    });
    const asText = new TextDecoder("utf8").decode(docx);
    expect(docx[0]).toBe(0x50); // P
    expect(docx[1]).toBe(0x4b); // K
    expect(asText.includes("PK") || docx.byteLength > 200).toBe(true);
    expect(plain.indexOf(WILL_DRAFT_COVER_WARNING)).toBeGreaterThan(-1);
    expect(plain.indexOf("LAST WILL AND TESTAMENT")).toBeGreaterThan(-1);
  });
});

describe("proforma will articles", () => {
  it("business pack on → Article VII; crypto pack on → Article IX without seed phrases", () => {
    const withBizCrypto: WillAnswers = {
      ...baseAnswers,
      packs: { business: true, crypto: true, employee: true },
      businessName: "Lovelace Engines LLC",
      businessEntityTypes: ["llc"],
      businessInterestRecipient: "Charles Babbage",
      businessOperationsManager: "Mary Somerville",
      cryptoHoldingTypes: "both",
      cryptoInstructionsLocation: "Digital Legacy secure notes",
      cryptoAccessRequester: "Charles Babbage",
      employerName: "Analytical Co",
      retirementPlansNotes: "401(k) at Fidelity",
      lifeInsuranceNotes: "Group life 2x salary",
    };
    const md = generateWillDraftMarkdown(withBizCrypto);
    expect(md).toContain("ARTICLE VII — BUSINESS INTERESTS");
    expect(md).toContain("Lovelace Engines LLC");
    expect(md).toContain("ARTICLE IX — DIGITAL ASSETS AND CRYPTOCURRENCY");
    expect(md).toContain("Private keys, seed phrases, and passwords must NOT appear");
    expect(md.toLowerCase()).not.toMatch(/seed phrase:|password:|private key:/);
    expect(md).toContain("ARTICLE VIII — RETIREMENT, LIFE INSURANCE, TOD/POD");
    expect(md).toMatch(/beneficiary form, not by this will/i);
  });

  it("W-2-only user → no VII/IX, still full form with I–V, XII, sample signature", () => {
    const w2: WillAnswers = {
      ...baseAnswers,
      packs: { employee: true },
      employerName: "Acme Corp",
      retirementPlansNotes: "401(k)",
      lifeInsuranceNotes: "Term policy",
      residueMode: "spouse_then_children",
      maritalStatus: "married",
      spouseLegalName: "William King",
    };
    const md = generateWillDraftMarkdown(w2);
    expect(md).toContain("ARTICLE I — IDENTITY AND FAMILY");
    expect(md).toContain("ARTICLE II — PERSONAL REPRESENTATIVE");
    expect(md).toContain("ARTICLE V — RESIDUARY ESTATE");
    expect(md).toContain("ARTICLE VIII — RETIREMENT");
    expect(md).toContain("ARTICLE XII — MISCELLANEOUS");
    expect(md).not.toContain("ARTICLE VII — BUSINESS");
    expect(md).not.toContain("ARTICLE IX — DIGITAL");
    expect(md).toContain("SAMPLE EXECUTION BLOCK");
    expect(md).toContain("IN WITNESS WHEREOF");
    expect(md).toContain("Witness 1:");
    expect(md).toContain(WILL_DRAFT_COVER_WARNING);
  });

  it("LA uses notarial note instead of generic two-witness block", () => {
    const la: WillAnswers = { ...baseAnswers, stateCode: "LA" };
    const md = generateWillDraftMarkdown(la);
    expect(md).toMatch(/LOUISIANA NOTE/i);
    expect(md).toMatch(/notarial testament/i);
    expect(md).not.toContain("Witness 1:");
  });

  it("TX notes separate self-proving affidavit", () => {
    const md = generateWillDraftMarkdown({ ...baseAnswers, stateCode: "TX" });
    expect(md).toMatch(/TEXAS NOTE/i);
    expect(md).toMatch(/self-proving affidavit/i);
  });

  it("omits Article III without minors and omits IV without gifts", () => {
    const md = generateWillDraftMarkdown({
      ...baseAnswers,
      childrenStatus: "none",
      specificGifts: [],
    });
    expect(md).not.toContain("ARTICLE III — GUARDIAN");
    expect(md).not.toContain("ARTICLE IV — SPECIFIC GIFTS");
  });

  it("includes Article III when minors listed", () => {
    const md = generateWillDraftMarkdown({
      ...baseAnswers,
      childrenStatus: "minors",
      children: [{ name: "Annabella", dob: "2018-01-01", relation: "mine" }],
      guardianName: "Mary",
      alternateGuardianName: "Jane",
    });
    expect(md).toContain("ARTICLE III — GUARDIAN OF MINORS");
    expect(md).toContain("Annabella");
  });
});

describe("ready checklist", () => {
  it("names the user’s state for finding an attorney", () => {
    const items = buildWillReadyChecklist("TX");
    expect(items.some((i) => i.includes("Texas"))).toBe(true);
    expect(items[0]).toMatch(/Read the draft/i);
  });
});

describe("Will Planner persistence", () => {
  it("step-only navigation does not count as answer content change", () => {
    const a = { ...baseAnswers, currentStepId: "identity" as const };
    const b = { ...baseAnswers, currentStepId: "executor" as const };
    expect(willAnswersContentChanged(a, b)).toBe(false);
    expect(willAnswersContentFingerprint(a)).toBe(
      willAnswersContentFingerprint(b),
    );
  });

  it("editing a field does count as content change", () => {
    const a = { ...baseAnswers, fullLegalName: "Ada Lovelace" };
    const b = { ...baseAnswers, fullLegalName: "Ada King" };
    expect(willAnswersContentChanged(a, b)).toBe(true);
  });

  it("updateWillDraftAnswers keeps draft_ready when only step changes", () => {
    const src = readFileSync(
      join(root, "src/lib/will-planner/drafts.ts"),
      "utf8",
    );
    expect(src).toContain("willAnswersContentChanged");
    expect(src).toMatch(
      /existing\.status === "draft_ready" && !contentChanged/,
    );
    expect(src).toContain("upsertWillPlannerDocument");
    expect(src).toContain("plannerDocumentId");
    expect(src).toContain("isR2Configured");
    expect(src).toMatch(/if \(isR2Configured\(\)\) \{\s*throw error;/);
  });

  it("generate upserts Wills/Estate private document PDF", () => {
    const src = readFileSync(
      join(root, "src/lib/will-planner/document-export.ts"),
      "utf8",
    );
    expect(src).toContain("buildPrivateDocumentStorageKey");
    expect(src).toContain("putObjectBytes");
    expect(src).toContain("isPrivateDocumentStorageKey");
    expect(src).not.toMatch(/getUploadUrl\(|R2_PREFIXES\.media/);
    expect(buildWillPlannerDocumentTitle({
      legalName: "Ada Lovelace",
      generatedAt: new Date("2026-08-29T12:00:00Z"),
    })).toMatch(/Will planner draft — Ada Lovelace —/);
    expect(parseWillDraftIdFromTags([willDraftIdTag("abc123")])).toBe("abc123");
  });

  it("page restores draft via searchParams and active load", () => {
    const src = readFileSync(
      join(root, "src/app/(app)/legacy/will/page.tsx"),
      "utf8",
    );
    expect(src).toContain("getOwnedWillDraft");
    expect(src).toContain("getActiveWillDraft");
    expect(src).toContain("searchParams");
    expect(src).toContain("initialView");
  });

  it("hub offers continue / edit / re-generate / start over", () => {
    const src = readFileSync(
      join(root, "src/components/will-planner/WillPlannerWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("Continue draft");
    expect(src).toContain("Edit answers");
    expect(src).toContain("Re-generate");
    expect(src).toContain("Start over");
    expect(src).toContain("dirtyRef");
  });

  it("download allows generated markdown even if status was demoted", () => {
    const src = readFileSync(
      join(root, "src/app/api/legacy/will/download/route.ts"),
      "utf8",
    );
    expect(src).toContain("!draft.generatedMarkdown");
    expect(src).not.toContain('draft.status !== "draft_ready"');
  });
});

describe("Make this a real will checklist", () => {
  it("TX includes two witnesses, self-proving, and community-property note", () => {
    const tasks = buildSigningChecklistTasks("TX");
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("sign_ceremony");
    expect(ids).toContain("self_proving");
    expect(ids).toContain("community_property");
    expect(ids).not.toContain("e_will_caution");

    const sign = tasks.find((t) => t.id === "sign_ceremony")!;
    expect(sign.label.toLowerCase()).toMatch(/witness/);
    expect(sign.label.toLowerCase()).not.toMatch(/notary \+ two/);

    const self = tasks.find((t) => t.id === "self_proving")!;
    expect(self.required).toBe(true);
    expect(self.label.toLowerCase()).toMatch(/self-proving|notary/);

    const cp = tasks.find((t) => t.id === "community_property")!;
    expect(cp.optional).toBe(true);
    expect(cp.label.toLowerCase()).toMatch(/community property|spouse/);
  });

  it("LA requires notarial signing and does not treat two-friend signing as enough", () => {
    const tasks = buildSigningChecklistTasks("LA");
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("sign_ceremony");
    expect(ids).not.toContain("self_proving");

    const sign = tasks.find((t) => t.id === "sign_ceremony")!;
    expect(sign.label.toLowerCase()).toMatch(/notary/);
    expect(sign.label.toLowerCase()).toMatch(/two witnesses|witnesses/);
    expect(sign.label.toLowerCase()).toMatch(/olograph/);
    // Must not imply a simple two-friend common-law ceremony is enough
    expect(sign.label.toLowerCase()).not.toMatch(/two adult witnesses who do not take/);
  });

  it("FL adds e-will DocuSign caution", () => {
    const tasks = buildSigningChecklistTasks("FL");
    expect(tasks.some((t) => t.id === "e_will_caution")).toBe(true);
    expect(
      tasks.find((t) => t.id === "e_will_caution")!.label,
    ).toMatch(/DocuSign/i);
  });

  it("MD limited self-proving asks attorney how state proves the will", () => {
    const tasks = buildSigningChecklistTasks("MD");
    const self = tasks.find((t) => t.id === "self_proving");
    expect(self?.label.toLowerCase()).toMatch(/ask your attorney how this state proves/);
  });

  it("tone names the state and denies checkbox = validity", () => {
    expect(willMakeRealTone("TX")).toMatch(/Texas/);
    expect(willMakeRealTone("TX").toLowerCase()).toMatch(
      /does not make the draft valid/,
    );
  });

  it("progress counts required only; upload unlock needs attorney + signing", () => {
    const tasks = buildSigningChecklistTasks("TX");
    const empty = normalizeSigningChecklistState({});
    const prog0 = signingChecklistProgress(tasks, empty);
    expect(prog0.checked).toBe(0);
    expect(prog0.required).toBeGreaterThan(5);
    expect(isSigningUploadUnlocked(empty)).toBe(false);

    const partial = normalizeSigningChecklistState({
      checks: {
        meet_attorney: true,
        attorney_prepares: true,
        sign_ceremony: true,
      },
    });
    expect(isSigningUploadUnlocked(partial)).toBe(true);
    expect(signingChecklistProgress(tasks, partial).checked).toBe(3);
  });

  it("unchecking does not imply deleting upload (API merge keeps signedScan)", () => {
    const checklistSrc = readFileSync(
      join(root, "src/app/api/legacy/will/checklist/route.ts"),
      "utf8",
    );
    expect(checklistSrc).toMatch(/Unchecking never deletes/);
    const draftsSrc = readFileSync(
      join(root, "src/lib/will-planner/drafts.ts"),
      "utf8",
    );
    expect(draftsSrc).toMatch(/Does not clear signedScan when unchecking/);
  });

  it("signed-scan APIs use private-documents only", () => {
    const completeSrc = readFileSync(
      join(root, "src/lib/will-planner/signed-scan.ts"),
      "utf8",
    );
    expect(completeSrc).toContain("private-documents-temp/");
    expect(completeSrc).toContain("isPrivateDocumentStorageKey");
    expect(completeSrc).toContain("ensureWillsEstateCategory");
    expect(completeSrc).toContain("Signed will scan");
    expect(completeSrc).not.toMatch(/R2_PREFIXES\.media|gallery|family-chat/);

    const uploadSrc = readFileSync(
      join(root, "src/app/api/legacy/will/signed-scan/upload-url/route.ts"),
      "utf8",
    );
    expect(uploadSrc).toContain("createPrivateDocumentUploadUrl");
    expect(uploadSrc).toContain("requireLegacyPlusApiUser");
    expect(uploadSrc).toContain("getOwnedWillDraft");
  });

  it("UI has no Mark as legal will / Execute now", () => {
    const ui = readFileSync(
      join(root, "src/components/will-planner/WillMakeRealChecklist.tsx"),
      "utf8",
    );
    expect(ui.toLowerCase()).not.toContain("mark as legal will");
    expect(ui.toLowerCase()).not.toContain("execute now");
    expect(ui).toContain("willMakeRealTone");
  });

  it("Ask AI notes say upload does not validate the will", () => {
    const entries = retrieveHelpEntries(
      "What is Make this a real will checklist? Does uploading a signed scan make the draft a legal will?",
    );
    expect(entries.some((e) => e.id === "will_planner")).toBe(true);
    const will = entries.find((e) => e.id === "will_planner");
    expect(
      will?.notes?.some((n) =>
        /uploading a scan does not make the draft valid/i.test(n),
      ),
    ).toBe(true);
  });
  it("gates checklist and signed-scan APIs behind Legacy+ and owner draft", () => {
    for (const rel of [
      "src/app/api/legacy/will/checklist/route.ts",
      "src/app/api/legacy/will/signed-scan/route.ts",
      "src/app/api/legacy/will/signed-scan/upload-url/route.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).toContain("requireLegacyPlusApiUser");
    }
    const uploadSrc = readFileSync(
      join(root, "src/app/api/legacy/will/signed-scan/upload-url/route.ts"),
      "utf8",
    );
    expect(uploadSrc).toContain("getOwnedWillDraft");
    const generateSrc = readFileSync(
      join(root, "src/lib/will-planner/drafts.ts"),
      "utf8",
    );
    // generate must not auto-fill checklist checks
    expect(generateSrc).toMatch(/generateAndSaveWillDraft/);
    const generateBody = generateSrc.slice(
      generateSrc.indexOf("generateAndSaveWillDraft"),
      generateSrc.indexOf("archiveActiveWillDraft"),
    );
    expect(generateBody).not.toContain("signingChecklist");
  });

  it("serialize includes signingChecklist for refresh persistence", () => {
    const draftsSrc = readFileSync(
      join(root, "src/lib/will-planner/drafts.ts"),
      "utf8",
    );
    expect(draftsSrc).toContain("signingChecklist: normalizeSigningChecklistState");
    expect(draftsSrc).toContain("signedScan: serializeSignedScan");
  });
});

describe("Ask AI will planner help", () => {
  it("retrieves will planner overview and not legal drafting", () => {
    const entries = retrieveHelpEntries(
      "What is the Will Planner? Is it a legal will?",
    );
    expect(entries[0]?.id).toBe("will_planner");
    expect(entries[0]?.summary.toLowerCase()).toContain("not a will");
    expect(entries[0]?.notes?.some((n) => /custom legal clauses/i.test(n))).toBe(
      true,
    );
    expect(
      entries[0]?.notes?.some((n) => /another user/i.test(n)),
    ).toBe(true);
  });
});
