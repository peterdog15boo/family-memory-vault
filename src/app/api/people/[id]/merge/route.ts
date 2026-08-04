import { NextResponse } from "next/server";
import { z } from "zod";
import { mergePeople } from "@/lib/people";
import {
  peopleApiErrorResponse,
  requirePeopleApiUser,
} from "@/lib/people/http";
import {
  getPersonWithPhotos,
  serializePersonDetail,
} from "@/lib/people/queries";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const mergeBodySchema = z.object({
  /** Person absorbed into the path id. Path person keeps name + cover. */
  sourcePersonId: z.string().min(1),
});

/**
 * POST /api/people/[id]/merge — merge sourcePersonId into this person (target).
 * Target name and cover are preserved.
 */
export async function POST(request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing person id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = mergeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid merge request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await mergePeople(id, parsed.data.sourcePersonId, userId);
    const person = await getPersonWithPhotos(id, userId);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json({ person: serializePersonDetail(person) });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to merge people");
  }
}
