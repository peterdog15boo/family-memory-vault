import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listRemoteFiles } from "@/lib/media/import/cloud";
import { isOAuthImportProvider } from "@/lib/media/import/providers";

/**
 * GET /api/media/import/browse?provider=&pageToken=
 */
export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") || "";
  if (!isOAuthImportProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (provider !== "google_drive" && provider !== "dropbox") {
    return NextResponse.json(
      {
        error: "Browsing is not available for this provider.",
        code: "unavailable",
      },
      { status: 503 },
    );
  }

  try {
    const result = await listRemoteFiles(userId, provider, {
      pageToken: url.searchParams.get("pageToken") || undefined,
      path: url.searchParams.get("path") || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not list files from this account.",
      },
      { status: 400 },
    );
  }
}
