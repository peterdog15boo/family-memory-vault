import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_PROPERTY_STATE_CODES,
  TRUST_DISCLAIMER_TEXT,
  TRUST_DISCLAIMER_VERSION,
  TRUST_DRAFT_PAGE_HEADER,
  TRUST_STEPS,
  buildFundingChecklistTasks,
  buildTrustDraftPdf,
  defaultTrustName,
  generateTrustDraftMarkdown,
  generateTrustDraftPlainText,
  isCommunityPropertyState,
  shouldIncludeTrustStep,
  trustFundingTone,
  trustProgressPercent,
  validateTrustResiduePercents,
  visibleTrustSteps,
  type TrustAnswers,
} from "@/lib/trust-planner";

const root = join(__dirname, "..", "..", "..");

const baseAnswers: TrustAnswers = {
  fullLegalName: "Ada Lovelace",
  city: "Houston",
  stateCode: "TX",
  trustName: defaultTrustName("Ada Lovelace", new Date(2026, 7, 29)),
  hasCoTrustee: false,
  successorTrusteeName: "Charles Babbage",
  alternateSuccessorTrusteeName: "Mary Somerville",
  residueMode: "spouse_then_children",
  minorHoldAge: "25",
  incapacityAcknowledged: true,
  wantsPourOverWill: true,
  packs: {},
};

describe("trust planner foundation", () => {
  it("gates /legacy/trust behind Legacy+", () => {
    const page = readFileSync(
      join(root, "src/app/(app)/legacy/trust/page.tsx"),
      "utf8",
    );
    expect(page).toContain("canUseLegacyPlusFeatures");
    expect(page).toContain("LegacyPlusLockedPage");
  });

  it("API route requires Legacy+", () => {
    const route = readFileSync(
      join(root, "src/app/api/legacy/trust/route.ts"),
      "utf8",
    );
    expect(route).toContain("requireLegacyPlusApiUser");
  });

  it("download route supports pdf and txt", () => {
    const route = readFileSync(
      join(root, "src/app/api/legacy/trust/download/route.ts"),
      "utf8",
    );
    expect(route).toContain("buildTrustDraftPdf");
    expect(route).toContain('format !== "pdf"');
  });

  it("disclaimer text matches clickwrap requirement", () => {
    expect(TRUST_DISCLAIMER_TEXT).toContain("planning draft");
    expect(TRUST_DISCLAIMER_TEXT).toContain("funding");
    expect(TRUST_DISCLAIMER_VERSION).toMatch(/^trust_disclaimer_v/);
  });

  it("migration defines trust_drafts table", () => {
    const sql = readFileSync(
      join(root, "drizzle/0075_trust_planner.sql"),
      "utf8",
    );
    expect(sql).toContain("trust_drafts");
    expect(sql).toContain("funding_checklist");
    expect(sql).toContain("linked_will_draft_id");
  });

  it("R2 uses private-legacy-trusts prefix", () => {
    const r2 = readFileSync(join(root, "src/lib/r2.ts"), "utf8");
    expect(r2).toContain("private-legacy-trusts/");
    expect(r2).toContain("isTrustDraftStorageKey");
  });
});

describe("revocable living trust interview", () => {
  it("defaults trust name from last name + today", () => {
    expect(defaultTrustName("Ada Lovelace", new Date(2026, 7, 29))).toBe(
      "Lovelace Family Trust dated August 29, 2026",
    );
  });

  it("always-on steps are present; pack steps skip when off", () => {
    const ids = visibleTrustSteps({ packs: {} });
    expect(ids).toContain("packs");
    expect(ids).toContain("basics");
    expect(ids).toContain("trustees");
    expect(ids).toContain("residue");
    expect(ids).toContain("minors");
    expect(ids).toContain("gifts");
    expect(ids).toContain("incapacity");
    expect(ids).toContain("pour_over");
    expect(ids).toContain("review");
    expect(ids).not.toContain("married");
    expect(ids).not.toContain("business");
    expect(ids).not.toContain("crypto");

    expect(
      shouldIncludeTrustStep("married", { packs: { married: true } }),
    ).toBe(true);
    expect(
      shouldIncludeTrustStep("crypto", { packs: { crypto: true } }),
    ).toBe(true);
  });

  it("community-property note states include TX and CA", () => {
    expect(COMMUNITY_PROPERTY_STATE_CODES).toContain("TX");
    expect(COMMUNITY_PROPERTY_STATE_CODES).toContain("CA");
    expect(isCommunityPropertyState("TX")).toBe(true);
    expect(isCommunityPropertyState("NY")).toBe(false);
  });

  it("blocks generate when residue percents ≠ 100", () => {
    const bad: TrustAnswers = {
      ...baseAnswers,
      residueMode: "specific_percents",
      residueShares: [
        { name: "Alice", percent: 60 },
        { name: "Bob", percent: 30 },
      ],
    };
    const result = validateTrustResiduePercents(bad);
    expect(result.ok).toBe(false);
    expect(() => generateTrustDraftMarkdown(bad)).toThrow(/100%/);

    const good: TrustAnswers = {
      ...bad,
      residueShares: [
        { name: "Alice", percent: 60 },
        { name: "Bob", percent: 40 },
      ],
    };
    expect(validateTrustResiduePercents(good).ok).toBe(true);
    const md = generateTrustDraftMarkdown(good);
    expect(md).toContain("REVOCABLE LIVING TRUST");
    expect(md).toContain("Alice");
    expect(md).toContain(
      "does not include irrevocable trust, tax, Crummey, or QTIP clauses",
    );
    expect(md).not.toMatch(/^## (Crummey|QTIP|Tax)/m);
  });

  it("spouse then children residue does not require percents", () => {
    expect(validateTrustResiduePercents(baseAnswers).ok).toBe(true);
    const md = generateTrustDraftMarkdown(baseAnswers);
    expect(md).toContain("spouse then children");
    expect(md).toContain("keep control");
    expect(md).toContain("Ada Lovelace serves as the initial trustee");
  });

  it("pack content appears when enabled", () => {
    const withPacks: TrustAnswers = {
      ...baseAnswers,
      packs: {
        married: true,
        real_estate: true,
        retirement: true,
        business: true,
        crypto: true,
      },
      spouseOrPartnerName: "William King",
      realEstateAddresses: [{ address: "1 Analytical Engine Way" }],
      retirementLifeInsuranceNotes: "401(k) at employer",
      businessName: "Lovelace Engines LLC",
      businessEntityType: "llc",
      businessOperatingAgreementConsent: true,
      cryptoDigitalNotes: "Self-custody; see Digital Legacy notes",
    };
    const md = generateTrustDraftMarkdown(withPacks);
    expect(md).toContain("community-property");
    expect(md).toContain("1 Analytical Engine Way");
    expect(md).toContain("beneficiary form is the lever");
    expect(md).toContain("operating agreement");
    expect(md).toContain("Digital Legacy");
    expect(visibleTrustSteps(withPacks)).toContain("married");
    expect(visibleTrustSteps(withPacks)).toContain("business");
  });

  it("catalog has no irrevocable / tax / Crummey / QTIP steps", () => {
    const blob = TRUST_STEPS.map((s) => `${s.title} ${s.description}`).join(
      " ",
    );
    expect(blob.toLowerCase()).not.toContain("crummey");
    expect(blob.toLowerCase()).not.toContain("qtip");
    expect(blob.toLowerCase()).not.toContain("irrevocable");
  });

  it("wizard progress reaches 100 on review", () => {
    expect(trustProgressPercent("review", baseAnswers)).toBe(100);
  });
});

describe("attorney draft generation", () => {
  it("includes required sections and disclaimer on page 1", () => {
    const md = generateTrustDraftMarkdown(baseAnswers);
    const headerPos = md.indexOf(TRUST_DRAFT_PAGE_HEADER);
    const partiesPos = md.indexOf("## PARTIES");
    expect(headerPos).toBeGreaterThan(-1);
    expect(headerPos).toBeLessThan(partiesPos);
    expect(md).toContain(TRUST_DISCLAIMER_TEXT);
    expect(md).toContain("## TRUST NAME");
    expect(md).toContain("## INITIAL TRUSTEE");
    expect(md).toContain("## SUCCESSOR TRUSTEES");
    expect(md).toContain("## LIFETIME");
    expect(md).toContain("## INCAPACITY");
    expect(md).toContain("## SPECIFIC GIFTS");
    expect(md).toContain("## RESIDUE");
    expect(md).toContain("## MINOR HOLDBACK");
    expect(md).toContain("## WHAT THIS DRAFT DOES NOT DO");
    expect(md).toContain("Unfunded assets");
    expect(md).toContain("Retirement titles");
    expect(md).toContain("Business consents");
    expect(md).toContain("Secrets");
    expect(md).toContain("STILL NOT A VALID TRUST");
    expect(md).toContain("does not cite or apply any statute");
    expect(md).not.toMatch(/\bSection \d+/);
    expect(md).not.toMatch(/\b\d+\s+U\.?S\.?C\.?\b/);
  });

  it("adds linked will alignment line when will draft linked", () => {
    const md = generateTrustDraftMarkdown(baseAnswers, {
      linkedWillDraftId: "will-draft-abc",
    });
    expect(md).toContain(
      "keep residue consistent with the will planner; your attorney should align both instruments",
    );
  });

  it("plain text strips markdown emphasis", () => {
    const plain = generateTrustDraftPlainText(baseAnswers);
    expect(plain).not.toContain("**");
    expect(plain).toContain("PARTIES");
  });

  it("PDF bytes include draft header near the start", () => {
    const plain = generateTrustDraftPlainText(baseAnswers);
    const pdf = buildTrustDraftPdf("Draft", plain, {
      pageHeader: TRUST_DRAFT_PAGE_HEADER,
      stateCode: "TX",
    });
    const asText = new TextDecoder("latin1").decode(pdf);
    expect(asText.indexOf("DRAFT")).toBeGreaterThan(-1);
    expect(asText.indexOf("Ada Lovelace")).toBeGreaterThan(-1);
  });
});

describe("Sign, fund, and archive checklist", () => {
  it("always includes signing steps and pour-over link", () => {
    const tasks = buildFundingChecklistTasks(baseAnswers, "TX", "will-abc");
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("attorney_prepares");
    expect(ids).toContain("sign_trust");
    expect(ids).toContain("pour_over_will");
    expect(ids).toContain("store_originals");
    expect(ids).toContain("upload_scan");
    expect(ids).toContain("pour_over_probate_note");

    const pourOver = tasks.find((t) => t.id === "pour_over_will")!;
    expect(pourOver.href).toContain("will-abc");
  });

  it("TX married adds community-property note", () => {
    const tasks = buildFundingChecklistTasks(
      { ...baseAnswers, packs: { married: true } },
      "TX",
      null,
    );
    expect(tasks.some((t) => t.id === "community_property")).toBe(true);
    const cp = tasks.find((t) => t.id === "community_property")!;
    expect(cp.label.toLowerCase()).toMatch(/community property|spouse/);
  });

  it("CA married adds community-property note", () => {
    const tasks = buildFundingChecklistTasks(
      { ...baseAnswers, stateCode: "CA", packs: { married: true } },
      "CA",
      null,
    );
    expect(tasks.some((t) => t.id === "community_property")).toBe(true);
  });

  it("adding a house adds a funding row", () => {
    const tasks = buildFundingChecklistTasks(
      {
        ...baseAnswers,
        packs: { real_estate: true },
        realEstateAddresses: [{ address: "123 Oak St" }],
      },
      "TX",
      null,
    );
    expect(tasks.some((t) => t.id === "fund_property_0")).toBe(true);
    expect(tasks.find((t) => t.id === "fund_property_0")!.label).toMatch(
      /123 Oak St/,
    );
  });

  it("dynamic pack rows appear when packs enabled", () => {
    const tasks = buildFundingChecklistTasks(
      {
        ...baseAnswers,
        packs: {
          bank_brokerage: true,
          retirement: true,
          business: true,
          crypto: true,
        },
      },
      "TX",
      null,
    );
    expect(tasks.map((t) => t.id)).toEqual(
      expect.arrayContaining([
        "fund_bank_brokerage",
        "fund_retirement",
        "fund_business",
        "fund_digital",
      ]),
    );
    const digital = tasks.find((t) => t.id === "fund_digital")!;
    expect(digital.label.toLowerCase()).toMatch(/legacy notes/);
    expect(digital.label.toLowerCase()).not.toContain("password");
  });

  it("tone denies checkbox = funding or validity", () => {
    expect(trustFundingTone("TX")).toMatch(/Texas/);
    expect(trustFundingTone("TX").toLowerCase()).toMatch(
      /does not fund the trust/,
    );
  });

  it("checklist has no secret/password fields", () => {
    const src = readFileSync(
      join(root, "src/lib/trust-planner/funding-checklist.ts"),
      "utf8",
    );
    expect(src.toLowerCase()).not.toMatch(/\bpasswords?\b.*label/);
    const ui = readFileSync(
      join(root, "src/components/trust-planner/TrustFundingChecklist.tsx"),
      "utf8",
    );
    expect(ui.toLowerCase()).not.toContain("password");
  });

  it("gates checklist and signed-scan APIs behind Legacy+ and owner draft", () => {
    for (const rel of [
      "src/app/api/legacy/trust/checklist/route.ts",
      "src/app/api/legacy/trust/signed-scan/route.ts",
      "src/app/api/legacy/trust/signed-scan/upload-url/route.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).toContain("requireLegacyPlusApiUser");
    }
    const uploadSrc = readFileSync(
      join(root, "src/app/api/legacy/trust/signed-scan/upload-url/route.ts"),
      "utf8",
    );
    expect(uploadSrc).toContain("getOwnedTrustDraft");
    const generateSrc = readFileSync(
      join(root, "src/lib/trust-planner/drafts.ts"),
      "utf8",
    );
    const generateBody = generateSrc.slice(
      generateSrc.indexOf("generateAndSaveTrustDraft"),
      generateSrc.indexOf("archiveActiveTrustDraft"),
    );
    expect(generateBody).not.toContain("fundingChecklist");
    expect(generateBody).not.toContain("signedScan");
  });

  it("signed-scan uses private-legacy-trusts only (not gallery)", () => {
    const completeSrc = readFileSync(
      join(root, "src/lib/trust-planner/signed-scan.ts"),
      "utf8",
    );
    expect(completeSrc).toContain("private-legacy-trusts-temp/");
    expect(completeSrc).toContain("isTrustDraftStorageKey");
    expect(completeSrc).toContain("Signed trust scan");
    expect(completeSrc).toContain("TRUST_SIGNED_SCAN_NOTE");
    expect(completeSrc).not.toMatch(/R2_PREFIXES\.media|family-chat/);

    const uploadSrc = readFileSync(
      join(root, "src/app/api/legacy/trust/signed-scan/upload-url/route.ts"),
      "utf8",
    );
    expect(uploadSrc).toContain("createTrustSignedScanUploadUrl");

    const storageSrc = readFileSync(
      join(root, "src/lib/trust-planner/storage.ts"),
      "utf8",
    );
    expect(storageSrc).toContain("private-legacy-trusts-temp/");
  });

  it("unchecking does not imply deleting upload (API merge keeps signedScan)", () => {
    const checklistSrc = readFileSync(
      join(root, "src/app/api/legacy/trust/checklist/route.ts"),
      "utf8",
    );
    expect(checklistSrc).toMatch(/Unchecking never deletes/);
    const draftsSrc = readFileSync(
      join(root, "src/lib/trust-planner/drafts.ts"),
      "utf8",
    );
    expect(draftsSrc).toMatch(/Does not clear signedScan when unchecking/);
  });

  it("serialize includes fundingChecklist and signedScan for refresh persistence", () => {
    const draftsSrc = readFileSync(
      join(root, "src/lib/trust-planner/drafts.ts"),
      "utf8",
    );
    expect(draftsSrc).toContain(
      "fundingChecklist: normalizeFundingChecklistState",
    );
    expect(draftsSrc).toContain("signedScan: serializeSignedScan");
  });
});
