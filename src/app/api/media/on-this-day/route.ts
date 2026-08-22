import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOnThisDayForUser } from "@/lib/media/on-this-day";

/**
 * GET /api/media/on-this-day — prior-year moments for today (accessible only).
 */
export async function GET() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getOnThisDayForUser(userId);
    return NextResponse.json({
      month: result.month,
      day: result.day,
      label: result.label,
      years: result.years,
      items: result.items.map((item) => ({
        id: item.id,
        userId: item.userId,
        type: item.type,
        contentType: item.contentType,
        originalFilename: item.originalFilename,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : item.createdAt,
        previewUrl: item.previewUrl,
        hasThumbnail: item.hasThumbnail,
        momentYear: item.momentYear,
        momentAt: item.momentAt,
        fromCaptureDate: item.fromCaptureDate,
      })),
    });
  } catch (error) {
    console.error("[on-this-day] failed", error);
    return NextResponse.json(
      { error: "Could not load On This Day." },
      { status: 500 },
    );
  }
}
