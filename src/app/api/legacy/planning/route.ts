import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listPrivateDocuments } from "@/lib/documents";
import { afterLegacyPlanningChanged } from "@/lib/gamification/legacy-ready";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  LEGACY_PLANNING_CATEGORY_IDS,
  LEGACY_PLANNING_SENSITIVITIES,
} from "@/lib/legacy/planning-categories";
import {
  createPlanningItem,
  loadPlanningScore,
  serializePlanningBoard,
  serializePlanningItem,
} from "@/lib/legacy/planning";
import { serializeLegacyDocumentOption } from "@/lib/legacy/serialize";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  categoryId: z.enum(LEGACY_PLANNING_CATEGORY_IDS),
  title: z.string().trim().min(1).max(200),
  institution: z.string().trim().max(200).optional().nullable(),
  accountHint: z.string().trim().max(32).optional().nullable(),
  locationHint: z.string().trim().max(500).optional().nullable(),
  contactName: z.string().trim().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  contactEmail: z.string().trim().email().max(320).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(20000).optional().nullable(),
  sensitivity: z.enum(LEGACY_PLANNING_SENSITIVITIES).optional(),
  documentIds: z.array(z.string().min(1).max(64)).max(12).optional(),
});

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const [{ score, items }, documents] = await Promise.all([
      loadPlanningScore(authResult.userId),
      listPrivateDocuments(authResult.userId, { limit: 200 }),
    ]);
    return NextResponse.json({
      board: serializePlanningBoard(score, items),
      documentOptions: documents.map(serializeLegacyDocumentOption),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load legacy plan");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-planning:${userId}`,
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
    return apiError("Invalid planning item", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const item = await createPlanningItem({
      userId,
      ...parsed.data,
      contactEmail: parsed.data.contactEmail || null,
    });
    const celebration = await afterLegacyPlanningChanged({
      userId,
      categoryId: item.categoryId,
    });
    const { score, items } = await loadPlanningScore(userId);
    return NextResponse.json({
      item: serializePlanningItem(item),
      board: serializePlanningBoard(score, items),
      celebration,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to create planning item");
  }
}
