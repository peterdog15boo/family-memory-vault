/**
 * Multi-page text PDF for Trust Planner exports (no PDF library).
 * Every page: DRAFT header + footer. Body includes cover disclaimer from generator.
 */

import {
  TRUST_DRAFT_PAGE_HEADER,
  trustDraftPageFooter,
} from "@/lib/trust-planner/generate";
import { TRUST_DISCLAIMER_TEXT } from "@/lib/trust-planner/constants";

/** Helvetica Type1 only supports WinAnsi — fold Unicode to ASCII for reliable rendering. */
function toPdfSafeText(text: string): string {
  return text
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2500/g, "-")
    .replace(/[^\t\n\r\x20-\x7E]/g, "?");
}

function escapePdfString(text: string): string {
  return toPdfSafeText(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function streamByteLength(stream: string): number {
  return new TextEncoder().encode(stream).byteLength;
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

export type BuildTrustPdfOptions = {
  pageHeader?: string;
  pageFooter?: string;
  footerDisclaimer?: string;
  stateCode?: string | null;
};

export function buildTrustDraftPdf(
  title: string,
  body: string,
  options?: BuildTrustPdfOptions,
): Uint8Array {
  const pageHeader = options?.pageHeader ?? TRUST_DRAFT_PAGE_HEADER;
  const pageFooter =
    options?.pageFooter ??
    (options?.stateCode != null
      ? trustDraftPageFooter(options.stateCode)
      : options?.footerDisclaimer) ??
    TRUST_DISCLAIMER_TEXT;

  const maxChars = 88;
  const headerLines = wrapLine(pageHeader, maxChars);
  const footerLines = wrapLine(pageFooter, maxChars);

  const bodyLines: string[] = [];
  if (title.trim() && !body.startsWith(title.trim())) {
    bodyLines.push(...wrapLine(title.trim(), maxChars));
    bodyLines.push("");
  }
  for (const paragraph of body.split(/\r?\n/)) {
    bodyLines.push(...wrapLine(paragraph, maxChars));
  }

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

    headerLines.slice(0, headerBlock).forEach((lineText, idx) => {
      const escaped = escapePdfString(lineText);
      if (idx === 0) contentLines.push(`(${escaped}) Tj`);
      else contentLines.push(`T* (${escaped}) Tj`);
    });
    contentLines.push("T* () Tj");

    pageBody.forEach((lineText) => {
      contentLines.push(`T* (${escapePdfString(lineText)}) Tj`);
    });

    const used = headerBlock + 1 + pageBody.length;
    const pad = Math.max(0, linesPerPageBody + headerBlock + 1 - used);
    for (let p = 0; p < pad; p++) {
      contentLines.push("T* () Tj");
    }
    contentLines.push("T* () Tj");
    footerLines.slice(0, footerBlock).forEach((lineText) => {
      contentLines.push(`T* (${escapePdfString(lineText)}) Tj`);
    });

    contentLines.push("ET");
    const stream = contentLines.join("\n");
    const contentId = addObj(
      `<< /Length ${streamByteLength(stream)} >>\nstream\n${stream}\nendstream`,
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
