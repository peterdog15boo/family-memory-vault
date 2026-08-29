/**
 * Multi-page text PDF for Will Planner exports (no PDF library).
 * Every page: DRAFT header + state footer. Body includes cover sheet from generator.
 */

import {
  WILL_DRAFT_PAGE_HEADER,
  willDraftPageFooter,
} from "@/lib/will-planner/generate";
import { WILL_DISCLAIMER_TEXT } from "@/lib/will-planner/constants";

function escapePdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(raw: string, maxChars: number, indent = ""): string[] {
  const text = raw.replace(/\t/g, "  ");
  if (!text.trim()) return [""];
  const out: string[] = [];
  let remaining = indent + text;
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(" ", maxChars);
    if (breakAt < Math.floor(maxChars * 0.4)) breakAt = maxChars;
    out.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) out.push(remaining);
  return out;
}

export type BuildWillPdfOptions = {
  /** Shown on every page (default: DRAFT — NOT AN EXECUTED WILL). */
  pageHeader?: string;
  /** Shown on every page footer (default: FMV disclaimer; pass state footer). */
  pageFooter?: string;
  /** @deprecated Prefer pageFooter — still accepted for older callers. */
  footerDisclaimer?: string;
  stateCode?: string | null;
};

/**
 * Build a multi-page PDF. Header + footer on every page; body is the proforma will text.
 */
export function buildSimpleTextPdf(
  title: string,
  body: string,
  options?: BuildWillPdfOptions,
): Uint8Array {
  const pageHeader = options?.pageHeader ?? WILL_DRAFT_PAGE_HEADER;
  const pageFooter =
    options?.pageFooter ??
    (options?.stateCode != null
      ? willDraftPageFooter(options.stateCode)
      : options?.footerDisclaimer) ??
    WILL_DISCLAIMER_TEXT;

  const maxChars = 88;
  const headerLines = wrapLine(pageHeader, maxChars);
  const footerLines = wrapLine(pageFooter, maxChars);

  const bodyLines: string[] = [];
  // Title line once at start of body stream (cover already in body from generator)
  if (title.trim() && !body.startsWith(title.trim())) {
    bodyLines.push(...wrapLine(title.trim(), maxChars));
    bodyLines.push("");
  }
  for (const paragraph of body.split(/\r?\n/)) {
    bodyLines.push(...wrapLine(paragraph, maxChars));
  }

  // Layout: header (2) + gap + body + gap + footer (up to 4) ≈ 48 body lines
  const headerBlock = Math.min(headerLines.length, 2);
  const footerBlock = Math.min(Math.max(footerLines.length, 1), 4);
  const linesPerPageBody = 48 - headerBlock - footerBlock;

  const pages: string[][] = [];
  for (let i = 0; i < bodyLines.length; i += linesPerPageBody) {
    pages.push(bodyLines.slice(i, i + linesPerPageBody));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  const addObj = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const kids: number[] = [];
  const contentIds: number[] = [];

  for (const pageBody of pages) {
    const contentLines = ["BT", "/F1 9 Tf", "50 760 Td", "12 TL"];

    // Header
    headerLines.slice(0, headerBlock).forEach((line, idx) => {
      const escaped = escapePdfString(line);
      if (idx === 0) contentLines.push(`(${escaped}) Tj`);
      else contentLines.push(`T* (${escaped}) Tj`);
    });
    contentLines.push("T* () Tj"); // gap under header

    // Body
    pageBody.forEach((line) => {
      contentLines.push(`T* (${escapePdfString(line)}) Tj`);
    });

    // Move toward footer: pad remaining body slots then write footer
    const used =
      headerBlock + 1 + pageBody.length;
    const pad = Math.max(0, linesPerPageBody + headerBlock + 1 - used);
    for (let p = 0; p < pad; p++) {
      contentLines.push("T* () Tj");
    }
    contentLines.push("T* () Tj");
    footerLines.slice(0, footerBlock).forEach((line) => {
      contentLines.push(`T* (${escapePdfString(line)}) Tj`);
    });

    contentLines.push("ET");
    const stream = contentLines.join("\n");
    const contentId = addObj(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    contentIds.push(contentId);
  }

  const fontId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );

  for (const contentId of contentIds) {
    const pageId = addObj(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    kids.push(pageId);
  }

  const pagesObjBody = `<< /Type /Pages /Kids [${kids
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${kids.length} >>`;
  const pagesId = addObj(pagesObjBody);

  for (const pageId of kids) {
    objects[pageId - 1] = objects[pageId - 1]!.replace(
      "/Parent 0 0 R",
      `/Parent ${pagesId} 0 R`,
    );
  }

  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const encoder = new TextEncoder();
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}
