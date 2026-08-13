import { describe, expect, it } from "vitest";
import { clearUserLocation } from "@/lib/location/index";

describe("clearUserLocation", () => {
  it("is exported for settings clear action", () => {
    expect(typeof clearUserLocation).toBe("function");
  });
});
