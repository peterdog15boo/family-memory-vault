import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  createDocumentCategory,
  ensureDefaultDocumentCategories,
  listDocumentCategories,
  countPrivateDocumentsByCategory,
} from "@/lib/documents";
import { serializeDocumentCategory } from "@/lib/documents/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
});

/**
 * GET /api/documents/categories
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    await ensureAppUser(userId);
    const [categories, counts] = await Promise.all([
      ensureDefaultDocumentCategories(userId),
      countPrivateDocumentsByCategory(userId),
    ]);
    return NextResponse.json({
      categories: categories.map((c) =>
        serializeDocumentCategory(c, counts[c.id] ?? 0),
      ),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list categories");
  }
}

/**
 * POST /api/documents/categories — create a custom category.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `documents-categories:${userId}`,
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
    return apiError("Invalid category", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await ensureAppUser(userId);
    // Ensure defaults exist so custom sortOrder stays after them.
    await listDocumentCategories(userId);
    const row = await createDocumentCategory({
      userId,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: 200,
    });
    return NextResponse.json({
      category: serializeDocumentCategory(row, 0),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to create category");
  }
}
