import { describe, expect, it } from "vitest";
import {
  APP_THEME_DEFAULT,
  APP_THEMES,
  isAppTheme,
  readStoredTheme,
} from "@/lib/theme/types";

describe("app theme defaults", () => {
  it("defaults to modern for new visitors", () => {
    expect(APP_THEME_DEFAULT).toBe("modern");
    expect(APP_THEMES[0]).toBe("modern");
  });

  it("still accepts original as a valid theme", () => {
    expect(isAppTheme("original")).toBe(true);
    expect(isAppTheme("modern")).toBe(true);
    expect(isAppTheme("dark")).toBe(false);
  });

  it("readStoredTheme falls back to modern when storage is empty", () => {
    // jsdom / node: no window localStorage preference → default
    expect(readStoredTheme()).toBe("modern");
  });
});
