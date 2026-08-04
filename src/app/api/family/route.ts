import { NextResponse } from "next/server";
import { z } from "zod";
import { createFamily, getUserFamilies } from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiUser,
} from "@/lib/families/http";
import {
  serializeFamily,
  serializeFamilyWithMembership,
} from "@/lib/families/serialize";
import { ensureAppUser } from "@/lib/users";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/**
 * GET /api/family — list families where the signed-in user is an active member.
 */
export async function GET() {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const families = await getUserFamilies(authResult.userId);
    return NextResponse.json({
      families: families.map(serializeFamilyWithMembership),
    });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to list families");
  }
}

/**
 * POST /api/family — create a family; caller becomes the owner.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid create request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    const family = await createFamily(userId, parsed.data.name);
    return NextResponse.json(
      { family: serializeFamily(family) },
      { status: 201 },
    );
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to create family");
  }
}
