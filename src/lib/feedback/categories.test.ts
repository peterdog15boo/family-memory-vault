import { describe, expect, it } from "vitest";
import {
  categoryFromPathname,
  normalizeFeedbackPath,
} from "@/lib/feedback/categories";

describe("normalizeFeedbackPath", () => {
  it("strips query, hash, and trailing slashes", () => {
    expect(normalizeFeedbackPath("/media/?tab=1#top")).toBe("/media");
    expect(normalizeFeedbackPath("/dashboard/")).toBe("/dashboard");
    expect(normalizeFeedbackPath("memories/abc")).toBe("/memories/abc");
  });
});

describe("categoryFromPathname", () => {
  it("maps core vault routes", () => {
    expect(categoryFromPathname("/dashboard")).toBe("Dashboard");
    expect(categoryFromPathname("/")).toBe("Dashboard");
    expect(categoryFromPathname("/media")).toBe("Photos & Media");
    expect(categoryFromPathname("/upload")).toBe("Photos & Media");
    expect(categoryFromPathname("/photos")).toBe("Photos & Media");
    expect(categoryFromPathname("/memories/abc")).toBe("Memories");
    expect(categoryFromPathname("/movies")).toBe("Movies");
    expect(categoryFromPathname("/people/x")).toBe("People");
    expect(categoryFromPathname("/legacy")).toBe("Legacy Planning");
    expect(categoryFromPathname("/documents/legacy")).toBe("Legacy Planning");
    expect(categoryFromPathname("/documents/legacy/will")).toBe(
      "Legacy Planning",
    );
    expect(categoryFromPathname("/documents")).toBe("Documents");
    expect(categoryFromPathname("/family")).toBe("Family Circle");
    expect(categoryFromPathname("/family/accept")).toBe("Family Circle");
    expect(categoryFromPathname("/settings")).toBe("Account & Billing");
    expect(categoryFromPathname("/billing")).toBe("Account & Billing");
    expect(categoryFromPathname("/pricing")).toBe("Account & Billing");
    expect(categoryFromPathname("/assistant")).toBe("Ask AI");
    expect(categoryFromPathname("/admin/review")).toBe("Admin");
    expect(categoryFromPathname("/family-memory-box")).toBe("Digitize");
    expect(categoryFromPathname("/digitize")).toBe("Digitize");
    expect(categoryFromPathname("/notifications")).toBe("Notifications");
    expect(categoryFromPathname("/emergency-access")).toBe("Emergency Access");
    expect(categoryFromPathname("/sign-in")).toBe("General");
    expect(categoryFromPathname("/something-else")).toBe("General");
  });

  it("ignores query and hash when mapping", () => {
    expect(categoryFromPathname("/media?view=grid")).toBe("Photos & Media");
    expect(categoryFromPathname("/legacy#contacts")).toBe("Legacy Planning");
  });
});
