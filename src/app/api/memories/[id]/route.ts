import { NextResponse } from "next/server";
import { z } from "zod";
import { MEMORY_FAMILY_ACCESS_LEVELS } from "@/lib/db/schema";
import {
  deleteMemory,
  getMemoryWithMedia,
  serializeMemoryWithMedia,
  setMemoryCover,
  setMemoryFamilySharing,
  updateMemory,
} from "@/lib/memories";
import {
  memoryApiErrorResponse,
  requireMemoryApiUser,
} from "@/lib/memories/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    coverMediaId: z.string().min(1).nullable().optional(),
    sharedWithFamily: z.boolean().optional(),
    familyAccess: z.enum(MEMORY_FAMILY_ACCESS_LEVELS).optional(),
    settings: z
      .object({
        slideshow: z
          .object({
            transition: z.enum(["fade", "slide", "none"]).optional(),
            photoDurationMs: z.number().int().min(1500).max(30000).optional(),
            musicMediaId: z.string().min(1).nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.coverMediaId !== undefined ||
      value.settings !== undefined ||
      value.sharedWithFamily !== undefined ||
      value.familyAccess !== undefined,
    { message: "Provide at least one field to update." },
  );

/**
 * GET /api/memories/[id] — detail for owner or family (when shared); clean media only.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
  }

  const memory = await getMemoryWithMedia(id, authResult.userId);
  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  return NextResponse.json({ memory: serializeMemoryWithMedia(memory) });
}

/**
 * PATCH /api/memories/[id] — update details / cover / family sharing.
 * Sharing and cover changes are owner-only (enforced in helpers).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
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
    if (
      parsed.data.title !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.settings !== undefined
    ) {
      await updateMemory(id, userId, {
        title: parsed.data.title,
        description: parsed.data.description,
        settings: parsed.data.settings,
      });
    }

    if (parsed.data.coverMediaId !== undefined) {
      await setMemoryCover(id, userId, parsed.data.coverMediaId);
    }

    if (
      parsed.data.sharedWithFamily !== undefined ||
      parsed.data.familyAccess !== undefined
    ) {
      const current = await getMemoryWithMedia(id, userId);
      if (!current || current.userId !== userId) {
        return NextResponse.json({ error: "Memory not found" }, { status: 404 });
      }
      await setMemoryFamilySharing(id, userId, {
        sharedWithFamily:
          parsed.data.sharedWithFamily ?? current.sharedWithFamily,
        familyAccess: parsed.data.familyAccess,
      });
    }

    const memory = await getMemoryWithMedia(id, userId);
    if (!memory) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({ memory: serializeMemoryWithMedia(memory) });
  } catch (error) {
    return memoryApiErrorResponse(error, "Failed to update memory");
  }
}

/**
 * DELETE /api/memories/[id] — owner-only album delete.
 * Removes the memory + join rows + generated movies. Media library files stay.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
  }

  try {
    const result = await deleteMemory(id, authResult.userId);
    return NextResponse.json({
      ok: true,
      id: result.id,
      title: result.title,
      deletedMovieCount: result.deletedMovieCount,
    });
  } catch (error) {
    return memoryApiErrorResponse(error, "Failed to delete memory");
  }
}
