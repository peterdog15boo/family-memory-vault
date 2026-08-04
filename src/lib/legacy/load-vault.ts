/**
 * Server-side loader for Digital Legacy pages and API.
 */

import { listPrivateDocuments } from "@/lib/documents";
import { getDigitalLegacyVault, listLegacyInstructionDocuments } from "@/lib/legacy";
import { computeLegacyProgress } from "@/lib/legacy/progress";
import {
  serializeLegacyContact,
  serializeLegacyInstruction,
  serializeLegacyDocumentOption,
  serializeLegacyProfile,
  serializeLegacySecureItem,
  serializeLegacyVideo,
  type LegacyProgress,
  type SerializedLegacyContact,
  type SerializedLegacyDocumentOption,
  type SerializedLegacyInstruction,
  type SerializedLegacyProfile,
  type SerializedLegacySecureItem,
  type SerializedLegacyVideo,
} from "@/lib/legacy/serialize";
import { listLegacyVideos } from "@/lib/legacy/videos";

export type LoadedLegacyVault = {
  profile: SerializedLegacyProfile;
  contacts: SerializedLegacyContact[];
  instructions: SerializedLegacyInstruction[];
  secureItems: SerializedLegacySecureItem[];
  /** Metadata only — never includes signed playback URLs. */
  videos: SerializedLegacyVideo[];
  documentOptions: SerializedLegacyDocumentOption[];
  progress: LegacyProgress;
};

export async function loadLegacyVault(
  userId: string,
  options?: { includeSecureContent?: boolean },
): Promise<LoadedLegacyVault> {
  const includeSecureContent = options?.includeSecureContent ?? false;
  const [vault, documents, instructionDocs, videoRows] = await Promise.all([
    getDigitalLegacyVault(userId),
    listPrivateDocuments(userId, { limit: 200 }),
    listLegacyInstructionDocuments(userId),
    listLegacyVideos(userId),
  ]);
  const docTitleById = new Map(documents.map((d) => [d.id, d.title]));
  const docById = new Map(documents.map((d) => [d.id, d]));
  const docsByInstructionId = new Map<string, SerializedLegacyDocumentOption[]>();
  for (const link of instructionDocs) {
    const doc = docById.get(link.documentId);
    if (!doc) continue;
    const current = docsByInstructionId.get(link.instructionId) ?? [];
    current.push(serializeLegacyDocumentOption(doc));
    docsByInstructionId.set(link.instructionId, current);
  }

  return {
    profile: serializeLegacyProfile(vault.profile),
    contacts: vault.contacts.map(serializeLegacyContact),
    instructions: vault.instructions.map((instruction) =>
      serializeLegacyInstruction(
        instruction,
        docsByInstructionId.get(instruction.id) ?? [],
      ),
    ),
    secureItems: vault.secureItems.map((item) =>
      serializeLegacySecureItem(
        item,
        item.relatedDocumentId
          ? docTitleById.get(item.relatedDocumentId) ?? null
          : null,
        { includeSensitiveFields: includeSecureContent },
      ),
    ),
    // No includeUrls — lists must not pre-sign sensitive video objects.
    videos: videoRows.map((row) => serializeLegacyVideo(row)),
    documentOptions: documents.map(serializeLegacyDocumentOption),
    progress: computeLegacyProgress({ ...vault, videos: videoRows }),
  };
}
