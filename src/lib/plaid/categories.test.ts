import { describe, expect, it } from "vitest";
import {
  categorizePlaidAccount,
  groupAccountsByCategory,
} from "./categories";

describe("categorizePlaidAccount", () => {
  it("maps checking/savings to banking", () => {
    expect(categorizePlaidAccount("depository", "checking")).toBe("banking");
    expect(categorizePlaidAccount("depository", "savings")).toBe("banking");
    expect(categorizePlaidAccount("depository", "cd")).toBe("banking");
    expect(categorizePlaidAccount("depository", "money market")).toBe(
      "banking",
    );
  });

  it("maps IRA/401k/brokerage to investments", () => {
    expect(categorizePlaidAccount("investment", "ira")).toBe("investments");
    expect(categorizePlaidAccount("investment", "401k")).toBe("investments");
    expect(categorizePlaidAccount("investment", "brokerage")).toBe(
      "investments",
    );
    expect(categorizePlaidAccount("investment", "roth")).toBe("investments");
  });

  it("maps student loans to loans_debt", () => {
    expect(categorizePlaidAccount("loan", "student")).toBe("loans_debt");
    expect(categorizePlaidAccount("loan", "mortgage")).toBe("loans_debt");
  });

  it("maps credit cards clearly", () => {
    expect(categorizePlaidAccount("credit", "credit card")).toBe(
      "credit_cards",
    );
    expect(categorizePlaidAccount("credit", null)).toBe("credit_cards");
  });

  it("maps HSA under insurance_benefits", () => {
    expect(categorizePlaidAccount("depository", "hsa")).toBe(
      "insurance_benefits",
    );
  });

  it("prefers other when ambiguous", () => {
    expect(categorizePlaidAccount("other", "weird")).toBe("other");
    expect(categorizePlaidAccount(null, null)).toBe("other");
    expect(categorizePlaidAccount("depository", "totally-unknown")).toBe(
      "other",
    );
  });
});

describe("groupAccountsByCategory", () => {
  it("hides empty categories and preserves order", () => {
    const groups = groupAccountsByCategory([
      { category: "investments" as const, id: "1" },
      { category: "banking" as const, id: "2" },
      { category: "banking" as const, id: "3" },
    ]);
    expect(groups.map((g) => g.category)).toEqual(["banking", "investments"]);
    expect(groups[0]?.accounts).toHaveLength(2);
  });
});
