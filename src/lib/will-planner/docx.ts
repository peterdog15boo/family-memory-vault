/**
 * Minimal .docx builder for Will Planner exports (OOXML + fflate).
 */

import { strToU8, zipSync } from "fflate";
import { WILL_DISCLAIMER_TEXT } from "@/lib/will-planner/constants";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string, opts?: { bold?: boolean }): string {
  const runProps = opts?.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const lines = text.split(/\n/);
  return lines
    .map((line) => {
      const content = escapeXml(line || " ");
      return `<w:p><w:r>${runProps}<w:t xml:space="preserve">${content}</w:t></w:r></w:p>`;
    })
    .join("");
}

/**
 * Build a simple Word document. Disclaimer is the first body content (page 1).
 */
export function buildSimpleDocx(
  title: string,
  body: string,
  options?: { disclaimer?: string },
): Uint8Array {
  const disclaimer = options?.disclaimer ?? WILL_DISCLAIMER_TEXT;
  const bodyXml = [
    paragraph(title, { bold: true }),
    paragraph(""),
    paragraph(disclaimer),
    paragraph(""),
    paragraph("---"),
    paragraph(""),
    ...body.split(/\n/).map((line) => paragraph(line)),
    paragraph(""),
    paragraph("---"),
    paragraph(""),
    paragraph(disclaimer),
  ].join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "word/document.xml": strToU8(documentXml),
  };

  return zipSync(files, { level: 6 });
}
