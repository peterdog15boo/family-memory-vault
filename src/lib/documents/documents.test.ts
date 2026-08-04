import { describe, expect, it } from "vitest";
import {
  slugifyDocumentCategory,
} from "@/lib/documents";
import {
  DEFAULT_DOCUMENT_CATEGORY_DEFS,
  DOCUMENT_REMINDER_KINDS,
  PRIVATE_DOCUMENTS_SAFETY,
} from "@/lib/documents/types";
import {
  getReminderUrgency,
  isReminderOverdue,
  reminderStatusLabel,
} from "@/lib/documents/dates";
import { getDocumentViewKind } from "@/lib/documents/view";
import {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_EXPIRES_IN_SECONDS,
  assertAllowedPrivateDocumentUpload,
  assertPrivateDocumentKeyForUser,
  buildPrivateDocumentStorageKey,
  buildPrivateDocumentTempKey,
  canGeneratePrivateDocumentImagePreview,
  contentTypeForPrivateDocumentFilename,
  isAllowedPrivateDocumentContentType,
  isPrivateDocumentKeyForUser,
  PrivateDocumentStorageError,
} from "@/lib/documents/storage";
import {
  getDownloadUrl,
  getInternalDownloadUrl,
  getUploadUrl,
  isPrivateDocumentStorageKey,
  R2_PREFIXES,
} from "@/lib/r2";

describe("private documents foundation", () => {
  it("defines the default category set", () => {
    expect(DEFAULT_DOCUMENT_CATEGORY_DEFS.map((d) => d.slug)).toEqual([
      "insurance",
      "financial",
      "contracts",
      "real-estate",
      "investments",
      "legal",
      "medical",
      "business",
      "personal-identification",
      "other",
    ]);
    expect(PRIVATE_DOCUMENTS_SAFETY.length).toBeGreaterThan(0);
  });

  it("defines reminder kinds", () => {
    expect([...DOCUMENT_REMINDER_KINDS]).toEqual([
      "renewal",
      "contract_end",
      "expiration",
      "review",
      "other",
    ]);
  });

  it("slugifies category names", () => {
    expect(slugifyDocumentCategory("Personal Identification")).toBe(
      "personal-identification",
    );
    expect(slugifyDocumentCategory("  Real Estate!! ")).toBe("real-estate");
  });

  it("builds owner-scoped R2 keys outside gallery prefixes", () => {
    const temp = buildPrivateDocumentTempKey({
      userId: "user_1",
      filename: "policy.pdf",
      uploadId: "up1",
    });
    expect(temp).toBe("private-documents-temp/user_1/up1.pdf");

    const permanent = buildPrivateDocumentStorageKey({
      userId: "user_1",
      documentId: "doc1",
      filename: "Home Policy.pdf",
    });
    expect(permanent).toBe(
      "private-documents/user_1/doc1/Home Policy.pdf",
    );
    expect(permanent.startsWith("originals/")).toBe(false);
    expect(isPrivateDocumentKeyForUser(permanent, "user_1")).toBe(true);
    expect(isPrivateDocumentKeyForUser(permanent, "user_2")).toBe(false);
    expect(isPrivateDocumentStorageKey(permanent)).toBe(true);
    expect(isPrivateDocumentStorageKey(temp)).toBe(true);
  });
});

describe("document reminder urgency", () => {
  const now = new Date("2026-07-28T15:00:00Z");

  it("flags overdue reminders", () => {
    expect(getReminderUrgency("2026-07-27T12:00:00.000Z", now)).toBe("overdue");
    expect(isReminderOverdue("2026-07-01T12:00:00.000Z", now)).toBe(true);
  });

  it("flags due today", () => {
    expect(getReminderUrgency("2026-07-28T12:00:00.000Z", now)).toBe(
      "due_today",
    );
  });

  it("flags upcoming reminders", () => {
    expect(getReminderUrgency("2026-08-01T12:00:00.000Z", now)).toBe(
      "upcoming",
    );
  });

  it("builds status labels with kind", () => {
    expect(
      reminderStatusLabel("2026-07-01T12:00:00.000Z", "renewal", now),
    ).toBe("Overdue · Policy / license renewal");
    expect(
      reminderStatusLabel("2026-08-01T12:00:00.000Z", "contract_end", now),
    ).toBe("Contract end date");
  });
});

describe("private document storage helpers", () => {
  it("allowlists PDF, images, and common office types", () => {
    expect(isAllowedPrivateDocumentContentType("application/pdf")).toBe(true);
    expect(isAllowedPrivateDocumentContentType("image/jpeg")).toBe(true);
    expect(isAllowedPrivateDocumentContentType("image/png")).toBe(true);
    expect(isAllowedPrivateDocumentContentType("image/webp")).toBe(true);
    expect(
      isAllowedPrivateDocumentContentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedPrivateDocumentContentType("video/mp4")).toBe(false);
    expect(PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES).toContain("application/pdf");
  });

  it("validates upload content type and size", () => {
    expect(
      assertAllowedPrivateDocumentUpload({
        contentType: "application/pdf",
        sizeBytes: 1024,
        filename: "a.pdf",
      }),
    ).toBe("application/pdf");

    expect(() =>
      assertAllowedPrivateDocumentUpload({
        contentType: "video/mp4",
        sizeBytes: 10,
      }),
    ).toThrow(PrivateDocumentStorageError);

    expect(() =>
      assertAllowedPrivateDocumentUpload({
        contentType: "image/jpeg",
        sizeBytes: 10,
        filename: "secret.pdf",
      }),
    ).toThrow(/does not match/);
  });

  it("maps filenames to content types and image preview eligibility", () => {
    expect(contentTypeForPrivateDocumentFilename("x.PNG")).toBe("image/png");
    expect(contentTypeForPrivateDocumentFilename("x.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(canGeneratePrivateDocumentImagePreview("image/webp")).toBe(true);
    expect(canGeneratePrivateDocumentImagePreview("application/pdf")).toBe(
      false,
    );
  });

  it("enforces owner key prefix", () => {
    expect(() =>
      assertPrivateDocumentKeyForUser(
        "private-documents/user_1/doc/a.pdf",
        "user_2",
      ),
    ).toThrow(PrivateDocumentStorageError);

    expect(() =>
      assertPrivateDocumentKeyForUser("originals/user_1/m/a.jpg", "user_1"),
    ).toThrow(PrivateDocumentStorageError);

    expect(() =>
      assertPrivateDocumentKeyForUser(
        `${R2_PREFIXES.privateDocuments}user_1/doc/a.pdf`,
        "user_1",
      ),
    ).not.toThrow();
  });

  it("keeps download TTL short for private documents", () => {
    expect(PRIVATE_DOCUMENT_DOWNLOAD_MAX_EXPIRES_IN_SECONDS).toBeLessThanOrEqual(
      60 * 5,
    );
  });

  it("refuses gallery media helpers for private-document keys", async () => {
    const privateKey = "private-documents/user_1/doc1/secret.pdf";

    await expect(
      getDownloadUrl(privateKey, 60, { moderationStatus: "clean" }),
    ).rejects.toThrow(/private document/i);

    await expect(getInternalDownloadUrl(privateKey)).rejects.toThrow(
      /private document/i,
    );

    await expect(
      getUploadUrl("private-documents-temp/user_1/x.pdf", "application/pdf"),
    ).rejects.toThrow(/temp\//);
  });
});

describe("private document dates", () => {
  it("parses calendar dates for metadata fields", async () => {
    const { parseOptionalDocumentDate, toDateInputValue } = await import(
      "@/lib/documents/dates"
    );
    const d = parseOptionalDocumentDate("2026-07-28");
    expect(d).toBeInstanceOf(Date);
    expect(toDateInputValue(d)).toBe("2026-07-28");
    expect(parseOptionalDocumentDate("")).toBeNull();
    expect(parseOptionalDocumentDate(undefined)).toBeUndefined();
  });
});

describe("private document viewer kinds", () => {
  it("maps PDF, Excel, and text to in-app preview kinds", () => {
    expect(getDocumentViewKind("application/pdf", "report.pdf")).toBe("pdf");
    expect(
      getDocumentViewKind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "budget.xlsx",
      ),
    ).toBe("spreadsheet");
    expect(getDocumentViewKind("application/vnd.ms-excel", "old.xls")).toBe(
      "spreadsheet",
    );
    expect(getDocumentViewKind("text/plain", "notes.txt")).toBe("text");
    expect(getDocumentViewKind("image/png", "scan.png")).toBe("image");
    expect(
      getDocumentViewKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "letter.docx",
      ),
    ).toBe("unsupported");
  });
});
