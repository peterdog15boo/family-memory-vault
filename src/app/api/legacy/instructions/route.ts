import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { LEGACY_INSTRUCTION_SECTION_TYPES } from "@/lib/db/schema";
import { listPrivateDocuments } from "@/lib/documents";
import {
  createLegacyInstruction,
  listLegacyInstructions,
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
import type { LegacyInstructionSectionType } from "@/lib/legacy/types";

const createSchema = z.object({
  sectionType: z.enum(LEGACY_INSTRUCTION_SECTION_TYPES),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  sortOrder: z.number().int().optional(),
  documentIds: z.array(z.string().min(1).max(64)).max(12).optional(),
});

export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const url = new URL(request.url);
  const section = url.searchParams.get("section")?.trim();
  const sectionType =
    section &&
    (LEGACY_INSTRUCTION_SECTION_TYPES as readonly string[]).includes(section)
      ? (section as LegacyInstructionSectionType)
      : undefined;

  try {
    const rows = await listLegacyInstructions(userId, sectionType);
    return NextResponse.json({
      instructions: rows.map((row) => serializeLegacyInstruction(row)),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list instructions");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-instructions:${userId}`,
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid instruction", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await createLegacyInstruction({
      userId,
      ...parsed.data,
    });
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
    return apiErrorFromUnknown(error, "Failed to create instruction");
  }
}
