import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { LEGACY_INSTRUCTION_SECTION_TYPES } from "@/lib/db/schema";
import { listPrivateDocuments } from "@/lib/documents";
import {
  deleteLegacyInstruction,
  updateLegacyInstruction,
} from "@/lib/legacy";
import {
  serializeLegacyDocumentOption,
  serializeLegacyInstruction,
} from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  sectionType: z.enum(LEGACY_INSTRUCTION_SECTION_TYPES).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  sortOrder: z.number().int().optional(),
  documentIds: z.array(z.string().min(1).max(64)).max(12).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-instructions-patch:${userId}`,
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await updateLegacyInstruction(id, userId, parsed.data);
    const documents = parsed.data.documentIds?.length
      ? await listPrivateDocuments(userId, { limit: 200 })
      : [];
    const attachedDocuments = documents
      .filter((doc) => parsed.data.documentIds?.includes(doc.id))
      .map(serializeLegacyDocumentOption);
    return NextResponse.json({
      instruction: serializeLegacyInstruction(row, attachedDocuments),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update instruction");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  try {
    await deleteLegacyInstruction(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete instruction");
  }
}
