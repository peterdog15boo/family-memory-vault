import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { LOCATION_SHARING_LEVELS } from "@/lib/db/schema";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { getOwnLocationSettings, updateUserLocation } from "@/lib/location";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    locationSharing: z.enum(LOCATION_SHARING_LEVELS).optional(),
    locationLabel: z.string().max(200).nullable().optional(),
    locationCity: z.string().max(120).nullable().optional(),
    locationRegion: z.string().max(120).nullable().optional(),
    locationCountry: z.string().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    geocodeManual: z.boolean().optional(),
    clearLocation: z.literal(true).optional(),
  })
  .strict();

const approximateSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

const preciseSchema = approximateSchema.extend({
  confirmPrecise: z.literal(true),
});

/**
 * GET  — current user's location sharing settings + preview
 * PATCH — update sharing level / manual place fields
 * POST — explicit device location actions (approximate or precise)
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    await ensureAppUser(authResult.userId);
    const payload = await getOwnLocationSettings(authResult.userId);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load location settings");
  }
}

export async function PATCH(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid location settings", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError("No location changes provided", {
      status: 400,
      code: "validation",
    });
  }

  try {
    await ensureAppUser(authResult.userId);
    const settings = await updateUserLocation(authResult.userId, parsed.data);
    const preview = (await getOwnLocationSettings(authResult.userId)).preview;
    return NextResponse.json({ ok: true, settings, preview });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update location settings");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const mode =
    typeof body === "object" && body !== null && "mode" in body
      ? (body as { mode?: string }).mode
      : undefined;

  try {
    await ensureAppUser(authResult.userId);

    if (mode === "approximate") {
      const parsed = approximateSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("Invalid approximate location", {
          status: 400,
          code: "validation",
          details: parsed.error.flatten(),
        });
      }

      const { applyApproximateLocationFromDevice } = await import(
        "@/lib/location"
      );
      const settings = await applyApproximateLocationFromDevice({
        userId: authResult.userId,
        ...parsed.data,
      });
      const preview = (await getOwnLocationSettings(authResult.userId)).preview;
      return NextResponse.json({ ok: true, settings, preview });
    }

    if (mode === "precise") {
      const parsed = preciseSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("Precise location requires explicit confirmation", {
          status: 400,
          code: "validation",
          details: parsed.error.flatten(),
        });
      }

      const { applyPreciseLocationFromDevice } = await import("@/lib/location");
      const settings = await applyPreciseLocationFromDevice({
        userId: authResult.userId,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      const preview = (await getOwnLocationSettings(authResult.userId)).preview;
      return NextResponse.json({ ok: true, settings, preview });
    }

    return apiError("Unknown location action", { status: 400, code: "validation" });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to save location");
  }
}
