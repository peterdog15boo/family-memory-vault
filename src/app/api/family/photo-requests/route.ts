import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import {
  createPhotoRequest,
  listPhotoRequestsForFamily,
  PhotoRequestError,
} from "@/lib/photo-requests";

const createSchema = z.object({
  familyId: z.string().min(1),
  targetMemberId: z.string().min(1),
  message: z.string().max(500).optional(),
  memoryId: z.string().min(1).optional().nullable(),
  personId: z.string().min(1).optional().nullable(),
});

/**
 * GET /api/family/photo-requests?familyId= — list requests for a family.
 * POST /api/family/photo-requests — create a contribution request.
 */
export async function GET(request: Request) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const familyId = new URL(request.url).searchParams.get("familyId")?.trim();
  if (!familyId) {
    return NextResponse.json({ error: "familyId is required" }, { status: 400 });
  }

  try {
    const requests = await listPhotoRequestsForFamily(familyId, userId);
    return NextResponse.json({ requests });
  } catch (error) {
    if (error instanceof PhotoRequestError) {
      const status =
        error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("[photo-requests] list failed", error);
    return NextResponse.json(
      { error: "Could not load photo requests." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid photo request payload." },
      { status: 400 },
    );
  }

  try {
    const result = await createPhotoRequest({
      familyId: parsed.data.familyId,
      requestedByUserId: userId,
      targetMemberId: parsed.data.targetMemberId,
      message: parsed.data.message,
      memoryId: parsed.data.memoryId,
      personId: parsed.data.personId,
    });
    return NextResponse.json({
      request: result.serialized,
      deepLink: result.deepLink,
    });
  } catch (error) {
    if (error instanceof PhotoRequestError) {
      const status =
        error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("[photo-requests] create failed", error);
    return NextResponse.json(
      { error: "Could not create photo request." },
      { status: 500 },
    );
  }
}
