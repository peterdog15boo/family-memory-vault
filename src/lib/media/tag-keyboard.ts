/**
 * Shared keyboard helpers for photo tag editing (tag mode + viewer).
 */

export type TagPhotoNavMode = "grid" | "viewer";

type NavigateDirection = "prev" | "next";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
  };
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function inputValue(target: EventTarget | null): string {
  if (
    target &&
    typeof target === "object" &&
    "value" in target &&
    typeof (target as { value: unknown }).value === "string"
  ) {
    return (target as { value: string }).value;
  }
  return "";
}

/**
 * Decide whether an arrow key should change photos vs move the text caret.
 *
 * grid (Photos tag mode): ↑/↓ always navigate; ←/→ navigate when empty or Alt.
 * viewer: ←/→ navigate when empty or Alt (↑/↓ ignored for photo nav).
 */
export function resolveTagPhotoNavigation(
  event: Pick<KeyboardEvent, "key" | "altKey" | "metaKey" | "ctrlKey" | "target">,
  mode: TagPhotoNavMode,
): NavigateDirection | null {
  if (event.metaKey || event.ctrlKey) return null;

  const key = event.key;
  const inEditable = isEditableTarget(event.target);
  const empty = !inputValue(event.target).trim();
  const force = event.altKey;

  if (mode === "grid") {
    if (key === "ArrowUp") return "prev";
    if (key === "ArrowDown") return "next";
  }

  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (!force && inEditable && !empty) return null;
    return key === "ArrowLeft" ? "prev" : "next";
  }

  return null;
}
