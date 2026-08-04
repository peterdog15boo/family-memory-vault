/**
 * Face-aware circular avatar framing.
 *
 * Focus is a normalized image point (0–1). Zoom ≥ 1 scales relative to a
 * cover-fit of the image inside a square crop (face fills the circle).
 */

import type { CSSProperties } from "react";
import type { FaceBoundingBox } from "@/lib/people/types";

export type AvatarFraming = {
  focusX: number;
  focusY: number;
  zoom: number;
};

/** Stored / API shape — nulls mean “use automatic face crop”. */
export type StoredAvatarFraming = {
  avatarFocusX: number | null;
  avatarFocusY: number | null;
  avatarZoom: number | null;
};

export const AVATAR_ZOOM_MIN = 1;
export const AVATAR_ZOOM_MAX = 4;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function clampZoom(n: number): number {
  if (!Number.isFinite(n)) return 1.2;
  return Math.min(AVATAR_ZOOM_MAX, Math.max(AVATAR_ZOOM_MIN, n));
}

/**
 * Derive a natural face-centered crop from a bounding box.
 * Small distant faces get stronger zoom so they fill the circle.
 */
export function framingFromFaceBox(
  box: FaceBoundingBox | null | undefined,
): AvatarFraming {
  if (
    !box ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return { focusX: 0.5, focusY: 0.38, zoom: 1.2 };
  }

  const focusX = clamp01(box.x + box.width / 2);
  // Slightly above geometric center so eyes/forehead sit naturally in-circle.
  const focusY = clamp01(box.y + box.height * 0.4);

  const faceSpan = Math.max(box.width, box.height);
  // Target: face spans ~52% of the circle diameter.
  const targetSpan = 0.52;
  const zoom = clampZoom(targetSpan / Math.max(faceSpan, 0.04));

  return { focusX, focusY, zoom };
}

/**
 * Resolve effective framing: manual override when all three are set,
 * otherwise automatic from the cover face box.
 */
export function resolveAvatarFraming(
  stored: StoredAvatarFraming | null | undefined,
  boundingBox: FaceBoundingBox | null | undefined,
): AvatarFraming {
  const auto = framingFromFaceBox(boundingBox);
  if (
    stored &&
    stored.avatarFocusX != null &&
    stored.avatarFocusY != null &&
    stored.avatarZoom != null &&
    Number.isFinite(stored.avatarFocusX) &&
    Number.isFinite(stored.avatarFocusY) &&
    Number.isFinite(stored.avatarZoom)
  ) {
    return {
      focusX: clamp01(stored.avatarFocusX),
      focusY: clamp01(stored.avatarFocusY),
      zoom: clampZoom(stored.avatarZoom),
    };
  }
  return auto;
}

export function hasManualAvatarFraming(
  stored: StoredAvatarFraming | null | undefined,
): boolean {
  return Boolean(
    stored &&
      stored.avatarFocusX != null &&
      stored.avatarFocusY != null &&
      stored.avatarZoom != null,
  );
}

/**
 * Absolute-position style so (focusX, focusY) sits at the container center
 * with cover-fit zoom. Requires natural image dimensions.
 */
export function avatarImageLayoutStyle(
  naturalWidth: number,
  naturalHeight: number,
  framing: AvatarFraming,
): CSSProperties {
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const aspect = nw / nh;
  const zoom = clampZoom(framing.zoom);
  const focusX = clamp01(framing.focusX);
  const focusY = clamp01(framing.focusY);

  let widthPct: number;
  let heightPct: number;
  if (aspect >= 1) {
    // Landscape / square — height fills the square at zoom 1.
    heightPct = 100 * zoom;
    widthPct = heightPct * aspect;
  } else {
    widthPct = 100 * zoom;
    heightPct = widthPct / aspect;
  }

  return {
    position: "absolute",
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    maxWidth: "none",
    left: `${50 - focusX * widthPct}%`,
    top: `${50 - focusY * heightPct}%`,
  };
}
