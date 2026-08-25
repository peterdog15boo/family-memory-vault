import { describe, expect, it } from "vitest";
import { APP_HOME_PATH, resolvePostAuthPath } from "@/lib/routes";

describe("resolvePostAuthPath", () => {
  it("defaults to vault home", () => {
    expect(resolvePostAuthPath()).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath(null)).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath("")).toBe(APP_HOME_PATH);
  });

  it("allows safe in-app deep links", () => {
    expect(resolvePostAuthPath("/family/accept?token=abc")).toBe(
      "/family/accept?token=abc",
    );
    expect(resolvePostAuthPath("/billing")).toBe("/billing");
  });

  it("rejects auth loops and open redirects", () => {
    expect(resolvePostAuthPath("/sign-in")).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath("/sign-up?x=1")).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath("//evil.example")).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath("https://evil.example")).toBe(APP_HOME_PATH);
    expect(resolvePostAuthPath("/")).toBe(APP_HOME_PATH);
  });
});
