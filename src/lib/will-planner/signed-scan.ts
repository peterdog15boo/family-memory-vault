/**
 * Attach a signed-will scan into Private Documents (Wills / Estate).
 */

import { nanoid } from "nanoid";
import {
  createPrivateDocument,
  deletePrivateDocumentWithStorage,
  ensureDefaultDocumentCategories,
  generatePrivateDocumentThumbnail,
  promotePrivateDocumentTempToPermanent,
} from "@/lib/documents";
import { deletePrivateDocumentObjects } from "@/lib/documents/storage";
import type { DocumentCategory, PrivateDocument } from "@/lib/db/schema";
import { isPrivateDocumentStorageKey } from "@/lib/r2";
import {
  WILL_ESTATE_CATEGORY,
  WILL_SIGNED_SCAN_NOTE,
  isWillSignedScanContentType,
  type WillSignedScan,
} from "@/lib/will-planner/signing-checklist";
import { setWillSignedScan } from "@/lib/will-planner/drafts";

export async function ensureWillsEstateCategory(
  userId: string,
): Promise<DocumentCategory> {
  const categories = await ensureDefaultDocumentCategories(userId);
  const found = categories.find((c) => c.slug === WILL_ESTATE_CATEGORY.slug);
  if (!found) {
    throw new Error("Wills / Estate category missing after ensure");
  }
  return found;
}

export async function completeWillSignedScanUpload(input: {
  userId: string;
  draftId: string;
  tempKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ draftScan: WillSignedScan; document: PrivateDocument }> {
  if (!isWillSignedScanContentType(input.contentType)) {
    throw new Error("Signed will scans must be PDF, JPEG, or PNG.");
  }
  if (!input.tempKey.includes("private-documents-temp/")) {
    throw new Error("Upload must use private document staging.");
  }

  const category = await ensureWillsEstateCategory(input.userId);
  const documentId = nanoid();
  let promotedKey: string | null = null;
  let thumbnailKey: string | null = null;

  try {
    const promoted = await promotePrivateDocumentTempToPermanent({
      userId: input.userId,
      documentId,
      tempKey: input.tempKey,
      filename: input.filename,
      expectedContentType: input.contentType,
      expectedSizeBytes: input.sizeBytes,
    });
    promotedKey = promoted.toKey;

    if (!isPrivateDocumentStorageKey(promoted.toKey)) {
      throw new Error("Promoted key is not private-documents storage.");
    }

    const thumb = await generatePrivateDocumentThumbnail({
      userId: input.userId,
      documentId,
      storageKey: promoted.toKey,
      contentType: input.contentType,
    });
    thumbnailKey = thumb.thumbnailKey;

    const document = await createPrivateDocument({
      id: documentId,
      userId: input.userId,
      categoryId: category.id,
      title: "Signed will (scan)",
      description:
        "User-supplied scan of a signed will. FMV does not verify signatures. The paper original remains the legal document.",
      notes: WILL_SIGNED_SCAN_NOTE,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: promoted.sizeBytes,
      storageKey: promoted.toKey,
      thumbnailKey: thumb.thumbnailKey,
      tags: ["will", "signed-scan", "estate"],
      importantFlag: true,
    });

    const scan: WillSignedScan = {
      documentId: document.id,
      storageKey: document.storageKey,
      originalFilename: document.originalFilename,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      uploadedAt: new Date().toISOString(),
      note: WILL_SIGNED_SCAN_NOTE,
    };

    const { previousDocumentId } = await setWillSignedScan({
      userId: input.userId,
      draftId: input.draftId,
      scan,
    });

    if (previousDocumentId && previousDocumentId !== document.id) {
      try {
        await deletePrivateDocumentWithStorage(
          previousDocumentId,
          input.userId,
        );
      } catch {
        // Best-effort cleanup of replaced scan
      }
    }

    return { draftScan: scan, document };
  } catch (error) {
    if (promotedKey) {
      try {
        await deletePrivateDocumentObjects({
          userId: input.userId,
          documentId,
          storageKey: promotedKey,
          thumbnailKey,
        });
      } catch {
        // ignore cleanup errors
      }
    }
    throw error;
  }
}

export async function removeWillSignedScan(input: {
  userId: string;
  draftId: string;
}): Promise<void> {
  const { previousDocumentId } = await setWillSignedScan({
    userId: input.userId,
    draftId: input.draftId,
    scan: null,
  });
  if (previousDocumentId) {
    await deletePrivateDocumentWithStorage(previousDocumentId, input.userId);
  }
}
