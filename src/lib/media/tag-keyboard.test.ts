/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { resolveTagPhotoNavigation } from "@/lib/media/tag-keyboard";

function keyEvent(
  key: string,
  opts: {
    altKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    value?: string;
    tag?: "INPUT" | "BUTTON";
  } = {},
) {
  const tag = opts.tag ?? "INPUT";
  let target: EventTarget;
  if (tag === "INPUT") {
    const input = document.createElement("input");
    input.value = opts.value ?? "";
    target = input;
  } else {
    target = document.createElement("button");
  }
  return {
    key,
    altKey: opts.altKey ?? false,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    target,
  };
}

describe("resolveTagPhotoNavigation", () => {
  it("grid: up/down always navigate", () => {
    expect(resolveTagPhotoNavigation(keyEvent("ArrowUp", { value: "beach" }), "grid")).toBe(
      "prev",
    );
    expect(resolveTagPhotoNavigation(keyEvent("ArrowDown", { value: "beach" }), "grid")).toBe(
      "next",
    );
  });

  it("grid/viewer: left/right navigate when input empty", () => {
    expect(resolveTagPhotoNavigation(keyEvent("ArrowLeft", { value: "" }), "grid")).toBe(
      "prev",
    );
    expect(resolveTagPhotoNavigation(keyEvent("ArrowRight", { value: "  " }), "viewer")).toBe(
      "next",
    );
  });

  it("left/right keep caret when typing unless Alt", () => {
    expect(
      resolveTagPhotoNavigation(keyEvent("ArrowLeft", { value: "beach" }), "viewer"),
    ).toBeNull();
    expect(
      resolveTagPhotoNavigation(
        keyEvent("ArrowRight", { value: "beach", altKey: true }),
        "viewer",
      ),
    ).toBe("next");
  });

  it("navigates from non-input targets", () => {
    expect(
      resolveTagPhotoNavigation(keyEvent("ArrowLeft", { tag: "BUTTON" }), "viewer"),
    ).toBe("prev");
  });
});
