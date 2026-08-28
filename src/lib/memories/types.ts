/**
 * Client-safe memory types & family-access constants.
 * Keep this free of Node-only deps (sharp, db, R2) so `"use client"` modules
 * can import without dragging server code into the browser bundle.
 */

import type { MemorySettings } from "@/lib/memories/settings";

export const MEMORY_FAMILY_ACCESS_LEVELS = ["view", "contribute"] as const;
export type MemoryFamilyAccess = (typeof MEMORY_FAMILY_ACCESS_LEVELS)[number];

export type MemoryType = "album" | "story";

/** Clean media as returned to the browser (ISO dates). */
export type SerializedSafeMedia = {
  id: string;
  userId: string;
  type: "photo" | "video";
  contentType: string;
  originalFilename: string | null;
  /** ISO string from APIs; Date may appear across the RSC boundary. */
  createdAt: string | Date;
  previewUrl: string | null;
  hasThumbnail: boolean;
  /** User caption for Photos library; null/omit when unset. */
  caption?: string | null;
};

export type SerializedMemoryMediaItem = SerializedSafeMedia & {
  sortOrder: number;
  caption: string | null;
  addedAt: string;
};

export type SerializedMemoryWithMedia = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  settings: MemorySettings;
  sharedWithFamily: boolean;
  familyAccess: MemoryFamilyAccess;
  createdAt: string;
  updatedAt: string;
  cover: SerializedSafeMedia | null;
  media: SerializedMemoryMediaItem[];
};

export type SerializedMemoryListItem = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  settings?: MemorySettings;
  sharedWithFamily: boolean;
  familyAccess: MemoryFamilyAccess;
  createdAt: string;
  updatedAt: string;
  mediaCount: number;
  cover: SerializedSafeMedia | null;
  isOwned: boolean;
};

/**
 * List row as passed from RSC → client (Dates may arrive as strings after
 * serialization). Prefer SerializedMemoryListItem for API JSON.
 */
export type MemoryListItem = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  settings?: MemorySettings;
  sharedWithFamily: boolean;
  familyAccess: MemoryFamilyAccess;
  createdAt: Date | string;
  updatedAt: Date | string;
  mediaCount: number;
  cover: SerializedSafeMedia | null;
  isOwned: boolean;
};
