/**
 * Client-safe helpers for in-app private document viewing.
 */

export type DocumentViewKind =
  | "pdf"
  | "image"
  | "text"
  | "spreadsheet"
  | "unsupported";

function extensionOf(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot).toLowerCase();
}

export function getDocumentViewKind(
  contentType: string,
  filename: string,
): DocumentViewKind {
  const type = contentType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = extensionOf(filename);

  if (type === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    type.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
  ) {
    return "image";
  }
  if (
    type === "text/plain" ||
    type === "text/csv" ||
    type === "application/rtf" ||
    [".txt", ".csv", ".rtf", ".md", ".log"].includes(ext)
  ) {
    return "text";
  }
  if (
    type === "application/vnd.ms-excel" ||
    type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel.sheet.macroenabled.12" ||
    [".xls", ".xlsx", ".xlsm"].includes(ext)
  ) {
    return "spreadsheet";
  }
  return "unsupported";
}

export function documentViewKindLabel(kind: DocumentViewKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "image":
      return "Image";
    case "text":
      return "Text";
    case "spreadsheet":
      return "Spreadsheet";
    default:
      return "File";
  }
}
