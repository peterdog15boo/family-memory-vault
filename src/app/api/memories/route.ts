import { NextResponse } from "next/server";
import { z } from "zod";
import { MEMORY_TYPES } from "@/lib/db/schema";
import {
  createMemory,
  listUserMemories,
  serializeMemoryListItem,
  serializeMemoryWithMedia,
} from "@/lib/memories";
import {
  memoryApiErrorResponse,
  requireMemoryApiUser,
} from "@/lib/memories/http";
import { ensureAppUser } from "@/lib/users";

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  coverMediaId: z.string().min(1).nullable().optional(),
  /** Only clean/ready owned media will be linked; others are skipped. */
  mediaIds: z.array(z.string().min(1)).optional(),
});

/**
 * GET /api/memories — list the signed-in user's memories (clean covers only).
 */
export async function GET() {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const memories = await listUserMemories(authResult.userId);
  return NextResponse.json({
    memories: memories.map(serializeMemoryListItem),
  });
}

/**
 * POST /api/memories — create a memory with optional clean media + cover.
 * Cover/members must be the caller's clean + ready media.
 */
export async function POST(request: Request) {
  const authResult = await requireMemoryApiUser();
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
    const memory = await createMemory({
      userId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      coverMediaId: parsed.data.coverMediaId,
      mediaIds: parsed.data.mediaIds,
    });

    return NextResponse.json(
      { memory: serializeMemoryWithMedia(memory) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid create request", details: error.flatten() },
        { status: 400 },
      );
    }
    return memoryApiErrorResponse(error, "Failed to create memory");
  }
}
