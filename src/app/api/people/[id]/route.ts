import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deletePerson,
  renamePerson,
  setPersonAvatarFraming,
  setPersonCover,
} from "@/lib/people";
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

const focusSchema = z.number().min(0).max(1);
const zoomSchema = z.number().min(1).max(4);

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    coverFaceId: z.string().min(1).nullable().optional(),
    avatarFocusX: focusSchema.nullable().optional(),
    avatarFocusY: focusSchema.nullable().optional(),
    avatarZoom: zoomSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasName = value.name !== undefined;
    const hasCover = value.coverFaceId !== undefined;
    const framingKeys = [
      value.avatarFocusX !== undefined,
      value.avatarFocusY !== undefined,
      value.avatarZoom !== undefined,
    ];
    const framingTouched = framingKeys.some(Boolean);
    if (!hasName && !hasCover && !framingTouched) {
      ctx.addIssue({
        code: "custom",
        message: "Provide name, coverFaceId, and/or avatar framing to update.",
      });
      return;
    }
    if (framingTouched && framingKeys.some((k) => !k)) {
      ctx.addIssue({
        code: "custom",
        message:
          "avatarFocusX, avatarFocusY, and avatarZoom must be sent together.",
      });
    }
  });

/**
 * GET /api/people/[id] — owner-scoped person detail with clean photo gallery.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing person id" }, { status: 400 });
  }

  try {
    const person = await getPersonWithPhotos(id, authResult.userId);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json({ person: serializePersonDetail(person) });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to load person");
  }
}

/**
 * PATCH /api/people/[id] — rename, set cover face, and/or avatar framing.
 */
export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.name !== undefined) {
      await renamePerson(id, userId, parsed.data.name);
    }
    if (parsed.data.coverFaceId !== undefined) {
      await setPersonCover(id, userId, parsed.data.coverFaceId);
    }
    if (
      parsed.data.avatarFocusX !== undefined &&
      parsed.data.avatarFocusY !== undefined &&
      parsed.data.avatarZoom !== undefined
    ) {
      await setPersonAvatarFraming(id, userId, {
        avatarFocusX: parsed.data.avatarFocusX,
        avatarFocusY: parsed.data.avatarFocusY,
        avatarZoom: parsed.data.avatarZoom,
      });
    }

    const person = await getPersonWithPhotos(id, userId);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json({ person: serializePersonDetail(person) });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to update person");
  }
}

/**
 * DELETE /api/people/[id] — remove person; photos stay, faces become unlabeled.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing person id" }, { status: 400 });
  }

  try {
    const result = await deletePerson(id, authResult.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to delete person");
  }
}
