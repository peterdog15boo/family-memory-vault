import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { bulkUpdatePrivateDocuments } from "@/lib/documents";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const bulkSchema = z
  .object({
    documentIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    categoryId: z.string().min(1).max(64).optional(),
    importantFlag: z.boolean().optional(),
  })
  .refine(
    (v) => v.categoryId !== undefined || v.importantFlag !== undefined,
    { message: "Provide categoryId and/or importantFlag." },
  );

/**
 * POST /api/documents/bulk — quick category / important updates.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `documents-bulk:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid bulk update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const updated = await bulkUpdatePrivateDocuments(userId, parsed.data);
    return NextResponse.json({ updated });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update documents");
  }
}
