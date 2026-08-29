/**
 * First-page teaser of the proforma will (client-safe).
 */

const NOTES_SPLIT = "— Markdown / plain text —";

/** Pull stored will text out of a Private Documents notes field. */
export function willTextFromDocumentNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes?.trim()) return null;
  const idx = notes.indexOf(NOTES_SPLIT);
  if (idx === -1) return notes.trim();
  const body = notes.slice(idx + NOTES_SPLIT.length).trim();
  return body || null;
}

/**
 * Approximate first page: cover through early articles (~letter body).
 */
export function willFormFirstPagePreview(
  fullText: string | null | undefined,
  maxChars = 2400,
): string {
  if (!fullText?.trim()) return "";
  const text = fullText.replace(/\r\n/g, "\n").trim();

  // Prefer a natural break after Article I or II if present within the window
  const window = text.slice(0, maxChars + 400);
  const articleBreak = window.search(/\nARTICLE (II|III|IV) —/);
  if (articleBreak > 800 && articleBreak < maxChars + 200) {
    return text.slice(0, articleBreak).trimEnd() + "\n\n…";
  }

  if (text.length <= maxChars) return text;

  let cut = text.lastIndexOf("\n\n", maxChars);
  if (cut < maxChars * 0.5) cut = text.lastIndexOf("\n", maxChars);
  if (cut < maxChars * 0.4) cut = maxChars;
  return text.slice(0, cut).trimEnd() + "\n\n…";
}

export const WILL_FORM_PREVIEW_NOTE =
  "This reads like a will so your attorney is not starting from a napkin. It is still a draft.";
