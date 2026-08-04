import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addMediaToMemory,
  getMemoryWithMedia,
  removeMediaFromMemory,
  serializeMemoryWithMedia,
} from "@/lib/memories";
import {
  memoryApiErrorResponse,
  requireMemoryApiUser,
} from "@/lib/memories/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const addMediaBodySchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1),
});

const removeMediaBodySchema = z.object({
  mediaId: z.string().min(1),
});

/**
 * POST /api/memories/[id]/media — attach clean/ready media owned by the caller.
 * Pending, rejected, adult, needs_human_review, and csam_quarantined ids are
 * never linked (skipped).
 */
export async function POST(request: Request, context: RouteContext) {
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

  const parsed = addMediaBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid media request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await addMediaToMemory(id, parsed.data.mediaIds, {
      userId,
    });
    const memory = await getMemoryWithMedia(id, userId);
    if (!memory) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...result,
      memory: serializeMemoryWithMedia(memory),
    });
  } catch (error) {
    return memoryApiErrorResponse(error, "Failed to add media to memory");
  }
}

/**
 * DELETE /api/memories/[id]/media — owner-only unlink.
 * Body: { mediaId }
 */
export async function DELETE(request: Request, context: RouteContext) {
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

  const parsed = removeMediaBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid remove request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await removeMediaFromMemory(id, parsed.data.mediaId, { userId });
    const memory = await getMemoryWithMedia(id, userId);
    if (!memory) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({
      memory: serializeMemoryWithMedia(memory),
    });
  } catch (error) {
    return memoryApiErrorResponse(error, "Failed to remove media from memory");
  }
}
