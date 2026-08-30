/**
 * Attach a signed-trust scan into Private Documents (Wills / Estate).
 * Storage lives under private-legacy-trusts/ — not gallery media.
 */

import { nanoid } from "nanoid";
import {
  createPrivateDocument,
  deletePrivateDocumentWithStorage,
  generatePrivateDocumentThumbnail,
} from "@/lib/documents";
import { deletePrivateDocumentObjects } from "@/lib/documents/storage";
import type { PrivateDocument } from "@/lib/db/schema";
import { deleteObject, isTrustDraftStorageKey } from "@/lib/r2";
import { setTrustSignedScan } from "@/lib/trust-planner/drafts";
import {
  TRUST_SIGNED_SCAN_NOTE,
  isTrustSignedScanContentType,
  type TrustSignedScan,
} from "@/lib/trust-planner/funding-checklist";
import {
  discardTrustSignedScanTempUpload,
  promoteTrustSignedScanTempToPermanent,
} from "@/lib/trust-planner/storage";

export async function completeTrustSignedScanUpload(input: {
  userId: string;
  draftId: string;
  tempKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ draftScan: TrustSignedScan; document: PrivateDocument }> {
  if (!isTrustSignedScanContentType(input.contentType)) {
    throw new Error("Signed trust scans must be PDF, JPEG, or PNG.");
  }
  if (!input.tempKey.includes("private-legacy-trusts-temp/")) {
    throw new Error("Upload must use private-legacy-trusts staging.");
  }

  const { ensureWillsEstateCategory } = await import(
    "@/lib/will-planner/wills-category"
  );
  const category = await ensureWillsEstateCategory(input.userId);
  const documentId = nanoid();
  let promotedKey: string | null = null;
  let thumbnailKey: string | null = null;

  try {
    const promoted = await promoteTrustSignedScanTempToPermanent({
      userId: input.userId,
      draftId: input.draftId,
      tempKey: input.tempKey,
      filename: input.filename,
      expectedContentType: input.contentType,
      expectedSizeBytes: input.sizeBytes,
    });
    promotedKey = promoted.toKey;

    if (!isTrustDraftStorageKey(promoted.toKey)) {
      throw new Error("Promoted key is not private-legacy-trusts storage.");
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
      title: "Signed trust scan",
      description:
        "User-supplied scan of a signed trust. FMV does not verify signatures or funding. The paper original remains the legal document.",
      notes: TRUST_SIGNED_SCAN_NOTE,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: promoted.sizeBytes,
      storageKey: promoted.toKey,
      thumbnailKey: thumb.thumbnailKey,
      tags: ["trust", "signed-scan", "estate", "signed-trust-scan"],
      importantFlag: true,
    });

    const scan: TrustSignedScan = {
      documentId: document.id,
      storageKey: document.storageKey,
      originalFilename: document.originalFilename,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      uploadedAt: new Date().toISOString(),
      note: TRUST_SIGNED_SCAN_NOTE,
    };

    const { previousDocumentId, previousStorageKey } = await setTrustSignedScan(
      {
        userId: input.userId,
        draftId: input.draftId,
        scan,
      },
    );

    if (previousDocumentId && previousDocumentId !== document.id) {
      try {
        await deletePrivateDocumentWithStorage(
          previousDocumentId,
          input.userId,
        );
      } catch {
        // Best-effort cleanup of replaced scan
      }
    } else if (
      previousStorageKey &&
      previousStorageKey !== promoted.toKey &&
      isTrustDraftStorageKey(previousStorageKey)
    ) {
      try {
        await deleteObject(previousStorageKey);
      } catch {
        // ignore
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

export async function removeTrustSignedScan(input: {
  userId: string;
  draftId: string;
}): Promise<void> {
  const { previousDocumentId } = await setTrustSignedScan({
    userId: input.userId,
    draftId: input.draftId,
    scan: null,
  });
  if (previousDocumentId) {
    await deletePrivateDocumentWithStorage(previousDocumentId, input.userId);
  }
}

export { discardTrustSignedScanTempUpload };
