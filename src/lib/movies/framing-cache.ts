/**
 * Resolve + cache face-aware framing on media rows.
 *
 * Always prefers live face detections; falls back to cached focal points on
 * the media row when face lookup fails — never silently centers the whole batch.
 *
 * CRITICAL: Rekognition / stored boxes often have x+width > 1 (edge faces).
 * Those must be *clamped into* the unit square — never dropped — or movies
 * incorrectly fall back to centerFraming while People UI still shows faces.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import {
  centerFraming,
  computeFramingFromFaces,
  resolveMaxZoomFromSubjectBounds,
  type MediaFraming,
  type MediaSubjectBounds,
} from "@/lib/movies/framing";
import { listFacesForMedia } from "@/lib/people";
import type { FaceBoundingBox } from "@/lib/people/types";

/**
 * Clamp a face box into the unit square without dropping edge detections.
 * Returns null only when the box is unusable (NaN / non-positive size).
 */
export function clampFaceBox(
  box: FaceBoundingBox | null | undefined,
): FaceBoundingBox | null {
  if (!box) return null;
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return null;
  }
  const x = Math.min(1, Math.max(0, box.x));
  const y = Math.min(1, Math.max(0, box.y));
  const width = Math.min(Math.max(0.001, box.width), Math.max(0.001, 1 - x));
  const height = Math.min(Math.max(0.001, box.height), Math.max(0.001, 1 - y));
  if (width < 0.001 || height < 0.001) return null;
  return { x, y, width, height };
}

/** @deprecated Use clampFaceBox — kept for call-site clarity in tests. */
export function isUsableFaceBox(
  box: FaceBoundingBox | null | undefined,
): box is FaceBoundingBox {
  return clampFaceBox(box) != null;
}

/** Rebuild framing from cached media columns (same zoom rules as live compute). */
export function framingFromMediaRow(row: Media): MediaFraming | null {
  if (
    row.focalPointX == null ||
    row.focalPointY == null ||
    !Number.isFinite(row.focalPointX) ||
    !Number.isFinite(row.focalPointY)
  ) {
    return null;
  }
  const bounds = row.subjectBounds as MediaSubjectBounds | null;
  const hasFaces = Boolean(bounds && bounds.faceCount > 0);
  return {
    focalPointX: row.focalPointX,
    focalPointY: row.focalPointY,
    subjectBounds: bounds,
    maxZoomAmount: resolveMaxZoomFromSubjectBounds(bounds),
    source: hasFaces ? "faces" : "center",
  };
}

/**
 * Load faces for media and return framing. Writes through to media cache
 * when faces are present (or clears stale cache when faces disappear).
 */
export async function resolveMediaFraming(
  row: Media,
  userId: string,
): Promise<MediaFraming> {
  const cached = framingFromMediaRow(row);

  let rawFaceCount = 0;
  let boxes: FaceBoundingBox[] = [];
  try {
    const faces = await listFacesForMedia(row.id, userId);
    rawFaceCount = faces.length;
    boxes = faces
      .map((f) => clampFaceBox(f.boundingBox))
      .filter((b): b is FaceBoundingBox => b != null);
  } catch (err) {
    console.warn("[movies.framing] Face lookup failed — using cache if any", {
      mediaId: row.id,
      err: err instanceof Error ? err.message : String(err),
      hasCache: Boolean(cached),
      cacheSource: cached?.source,
    });
    if (cached) return cached;
    return centerFraming();
  }

  // Faces existed in DB but all were previously rejected as "invalid" edge
  // boxes — never poison the media cache with center while People still shows faces.
  if (boxes.length === 0 && rawFaceCount > 0) {
    console.warn(
      "[movies.framing] Faces present but none usable after clamp — keeping face cache (fail-closed)",
      { mediaId: row.id, rawFaceCount, cacheSource: cached?.source },
    );
    if (cached?.source === "faces") return cached;
    // Last resort: still prefer any cached focal over inventing center when
    // People UI has face rows for this media.
    if (cached) return { ...cached, source: "faces" };
    return centerFraming();
  }

  const computed =
    boxes.length > 0 ? computeFramingFromFaces(boxes) : centerFraming();

  console.info("[movies.framing] Resolved clip framing", {
    mediaId: row.id,
    hasFaceData: rawFaceCount > 0,
    rawFaceCount,
    usableBoxes: boxes.length,
    path: computed.source,
    focalPointX: Number(computed.focalPointX.toFixed(4)),
    focalPointY: Number(computed.focalPointY.toFixed(4)),
    subjectBounds: computed.subjectBounds
      ? {
          x: Number(computed.subjectBounds.x.toFixed(4)),
          y: Number(computed.subjectBounds.y.toFixed(4)),
          width: Number(computed.subjectBounds.width.toFixed(4)),
          height: Number(computed.subjectBounds.height.toFixed(4)),
          faceCount: computed.subjectBounds.faceCount,
        }
      : null,
    maxZoomAmount: computed.maxZoomAmount,
  });

  // Do not overwrite a face-aware cache with center when detections disappeared
  // transiently (empty list) — prefer stale face framing over recentering.
  if (
    computed.source === "center" &&
    cached?.source === "faces" &&
    rawFaceCount === 0
  ) {
    console.warn(
      "[movies.framing] No live faces — reusing cached face framing",
      { mediaId: row.id },
    );
    return cached;
  }

  const sameSignature =
    cached?.subjectBounds?.signature &&
    computed.subjectBounds?.signature &&
    cached.subjectBounds.signature === computed.subjectBounds.signature &&
    Math.abs(cached.focalPointX - computed.focalPointX) < 0.001 &&
    Math.abs(cached.focalPointY - computed.focalPointY) < 0.001;

  if (sameSignature && cached) {
    return {
      ...computed,
      focalPointX: cached.focalPointX,
      focalPointY: cached.focalPointY,
      subjectBounds: computed.subjectBounds ?? cached.subjectBounds,
      maxZoomAmount: computed.maxZoomAmount,
      source: computed.source,
    };
  }

  // Persist for later renders / jobs.
  try {
    const db = getDb();
    await db
      .update(media)
      .set({
        focalPointX: computed.focalPointX,
        focalPointY: computed.focalPointY,
        subjectBounds: computed.subjectBounds,
        framingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(media.id, row.id), eq(media.userId, userId)));
  } catch (err) {
    console.warn("[movies.framing] Failed to cache focal point", {
      mediaId: row.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return computed;
}

/**
 * Batch resolve framing for many media rows.
 * Each item is isolated — one failure never forces center crop on the rest.
 * Fail-closed: prefer cached face framing over silent center when available.
 */
export async function resolveFramingForClips(
  rows: Media[],
  userId: string,
): Promise<Map<string, MediaFraming>> {
  const out = new Map<string, MediaFraming>();
  const concurrency = 4;
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const framed = await Promise.all(
      batch.map(async (row) => {
        try {
          const framing = await resolveMediaFraming(row, userId);
          return [row.id, framing] as const;
        } catch (err) {
          console.warn("[movies.framing] Per-clip resolve failed — fail-closed to cache", {
            mediaId: row.id,
            err: err instanceof Error ? err.message : String(err),
          });
          const cached = framingFromMediaRow(row);
          if (cached?.source === "faces") return [row.id, cached] as const;
          return [row.id, cached ?? centerFraming()] as const;
        }
      }),
    );
    for (const [id, framing] of framed) out.set(id, framing);
  }
  return out;
}

/**
 * Re-resolve framing for a single clip at render time when plan framing is
 * missing or center — never silently center-crop if face data can be fetched.
 */
export async function ensureFaceFramingForRender(
  row: Media,
  userId: string,
  planned: MediaFraming | null | undefined,
): Promise<MediaFraming> {
  if (planned?.source === "faces" && planned.subjectBounds?.faceCount) {
    return planned;
  }
  console.info("[movies.framing] Re-resolving framing before render (fail-closed)", {
    mediaId: row.id,
    plannedSource: planned?.source ?? "missing",
  });
  return resolveMediaFraming(row, userId);
}
