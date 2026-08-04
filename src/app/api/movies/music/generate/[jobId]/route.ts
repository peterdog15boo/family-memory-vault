import { NextResponse } from "next/server";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import {
  getAiSoundtrackJobForUser,
  serializeAiSoundtrackJob,
} from "@/lib/movies/music/ai";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

/**
 * GET /api/movies/music/generate/[jobId] — poll AI soundtrack job progress.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { jobId } = await context.params;
  if (!jobId?.trim()) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  try {
    const found = await getAiSoundtrackJobForUser(jobId, userId);
    if (!found) {
      return NextResponse.json(
        { error: "Soundtrack job not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(serializeAiSoundtrackJob(found.job, found.payload));
  } catch (error) {
    return movieApiErrorResponse(error, "Could not load soundtrack job");
  }
}
