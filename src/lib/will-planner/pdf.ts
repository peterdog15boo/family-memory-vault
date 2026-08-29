/**
 * Minimal single-page text PDF for Will Planner downloads (no PDF library).
 */

import { WILL_DISCLAIMER_TEXT } from "@/lib/will-planner/constants";

function escapePdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a simple multi-page PDF from plain text lines.
 * Helvetica only; wraps long lines approximately for letter width.
 */
export function buildSimpleTextPdf(
  title: string,
  body: string,
  options?: { footerDisclaimer?: string },
): Uint8Array {
  const disclaimer = options?.footerDisclaimer ?? WILL_DISCLAIMER_TEXT;
  const maxChars = 90;
  const lines: string[] = [];

  const pushWrapped = (raw: string, indent = "") => {
    const text = raw.replace(/\t/g, "  ");
    if (!text.trim()) {
      lines.push("");
      return;
    }
    let remaining = indent + text;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(" ", maxChars);
      if (breakAt < 40) breakAt = maxChars;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) lines.push(remaining);
  };

  pushWrapped(title);
  lines.push("");
  pushWrapped(disclaimer);
  lines.push("");
  pushWrapped("---");
  lines.push("");
  for (const paragraph of body.split(/\r?\n/)) {
    pushWrapped(paragraph);
  }
  lines.push("");
  lines.push("---");
  pushWrapped(disclaimer);

  const linesPerPage = 54;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  const addObj = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const kids: number[] = [];
  const contentIds: number[] = [];

  for (const pageLines of pages) {
    const contentLines = [
      "BT",
      "/F1 10 Tf",
      "50 742 Td",
      "14 TL",
    ];
    pageLines.forEach((line, idx) => {
      const escaped = escapePdfString(line);
      if (idx === 0) {
        contentLines.push(`(${escaped}) Tj`);
      } else {
        contentLines.push(`T* (${escaped}) Tj`);
      }
    });
    contentLines.push("ET");
    const stream = contentLines.join("\n");
    const contentId = addObj(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    contentIds.push(contentId);
  }

  const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const contentId of contentIds) {
    const pageId = addObj(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    kids.push(pageId);
  }

  // Patch parent refs: pages object will be inserted, then we fix Parent.
  const pagesObjBody = `<< /Type /Pages /Kids [${kids
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${kids.length} >>`;
  const pagesId = addObj(pagesObjBody);

  // Fix Parent placeholder in page objects
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
