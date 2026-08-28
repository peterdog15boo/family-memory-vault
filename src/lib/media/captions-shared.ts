/**
 * Client-safe caption constants & payload shape.
 * Keep free of Node-only deps so `"use client"` modules can import it.
 */

export const MEDIA_CAPTION_MAX_LENGTH = 500;

export type MediaCaptionPayload = {
  mediaId: string;
  caption: string | null;
  captionUpdatedAt: string | null;
  captionUpdatedByUserId: string | null;
  /** First-name style label when helpful; null when unknown / noisy. */
  captionUpdatedByName: string | null;
  canEdit: boolean;
};
