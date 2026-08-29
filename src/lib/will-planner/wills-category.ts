/**
 * Ensure Private Documents “Wills / Estate” category for the owner.
 */

import {
  ensureDefaultDocumentCategories,
} from "@/lib/documents";
import type { DocumentCategory } from "@/lib/db/schema";
import { WILL_ESTATE_CATEGORY } from "@/lib/will-planner/signing-checklist";

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
