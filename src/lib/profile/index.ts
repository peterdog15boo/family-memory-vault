/**
 * Shared profile source of truth for Ava + Settings.
 * Display name and avatar live on `users.displayName` / `users.imageUrl`,
 * kept in sync with Clerk whenever possible so both UIs agree.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isAvaAvatarPresetUrl } from "@/lib/ava/setup";

const PLACEHOLDER_NAMES = new Set([
  "family member",
  "there",
  "user",
  "guest",
]);

export type LiveProfile = {
  displayName: string | null;
  imageUrl: string | null;
  email: string | null;
};

export function isRealDisplayName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length < 2) return false;
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return false;
  // Clerk may fall back to email when OAuth has no given name — still ask Ava.
  if (trimmed.includes("@")) return false;
  return true;
}

export function isRealAvatarUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  return trimmed.length > 0;
}

export async function getLiveProfile(userId: string): Promise<LiveProfile> {
  const db = getDb();
  const [row] = await db
    .select({
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    displayName: row?.displayName?.trim() || null,
    imageUrl: row?.imageUrl?.trim() || null,
    email: row?.email ?? null,
  };
}

/**
 * Pull Clerk → local DB (overwrites displayName / imageUrl).
 * Used after Settings client updates Clerk, or to refresh stale rows.
 */
export async function syncProfileFromClerk(userId: string): Promise<LiveProfile> {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    clerkUser.primaryEmailAddress?.emailAddress ||
    null;
  const imageUrl = clerkUser.imageUrl?.trim() || null;
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    null;

  const db = getDb();
  await db
    .update(users)
    .set({
      ...(email ? { email } : {}),
      displayName,
      imageUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  console.info("[profile.syncFromClerk]", {
    userId,
    displayName,
    imageUrl: imageUrl ? `${imageUrl.slice(0, 64)}…` : null,
  });

  return { displayName, imageUrl, email };
}

/** Write display name to Clerk + local DB (Ava + Settings shared write). */
export async function saveProfileDisplayName(
  userId: string,
  rawName: string,
): Promise<LiveProfile> {
  const value = rawName.trim().replace(/\s+/g, " ");
  if (!isRealDisplayName(value)) {
    throw new Error("Please enter a real display name.");
  }

  const parts = value.split(/\s+/);
  const firstName = parts[0] ?? value;
  const lastName = parts.slice(1).join(" ");

  console.info("[profile.saveDisplayName.write]", {
    userId,
    value,
    firstName,
    lastName: lastName || null,
  });

  const client = await clerkClient();
  await client.users.updateUser(userId, {
    firstName,
    lastName: lastName || "",
  });

  const db = getDb();
  await db
    .update(users)
    .set({ displayName: value, updatedAt: new Date() })
    .where(eq(users.id, userId));

  const live = await getLiveProfile(userId);
  console.info("[profile.saveDisplayName.readback]", {
    userId,
    displayName: live.displayName,
    hasScreenName: isRealDisplayName(live.displayName),
  });

  if (!isRealDisplayName(live.displayName)) {
    throw new Error("Name did not save to your profile. Please try again.");
  }

  return live;
}

async function fileFromDataUrl(dataUrl: string): Promise<File> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image data.");
  }
  const mime = match[1]!;
  const buf = Buffer.from(match[2]!, "base64");
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  return new File([buf], `avatar.${ext}`, { type: mime });
}

async function fileFromPresetPath(presetUrl: string): Promise<File> {
  const relative = presetUrl.replace(/^\//, "");
  const abs = path.join(process.cwd(), "public", relative);
  const buf = await readFile(abs);
  // Clerk expects a raster image; convert SVG presets via sharp when needed.
  if (presetUrl.endsWith(".svg")) {
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf).png().toBuffer();
    return new File([png], "avatar.png", { type: "image/png" });
  }
  const ext = path.extname(presetUrl).replace(".", "") || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  return new File([buf], `avatar.${ext}`, { type: mime });
}

async function fileFromRemoteUrl(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Could not download that photo for your profile.");
  }
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return new File([buf], `avatar.${ext}`, { type: mime.split(";")[0]!.trim() });
}

/**
 * Write avatar to Clerk + local DB.
 * Accepts data URLs, Ava preset paths, or https URLs.
 */
export async function saveProfileAvatar(
  userId: string,
  source: { dataUrl?: string; presetUrl?: string; httpsUrl?: string },
): Promise<LiveProfile> {
  let file: File;
  if (source.dataUrl?.startsWith("data:")) {
    file = await fileFromDataUrl(source.dataUrl);
  } else if (source.presetUrl && isAvaAvatarPresetUrl(source.presetUrl)) {
    file = await fileFromPresetPath(source.presetUrl);
  } else if (source.httpsUrl?.startsWith("http")) {
    file = await fileFromRemoteUrl(source.httpsUrl);
  } else {
    throw new Error("Provide a valid avatar image.");
  }

  console.info("[profile.saveAvatar.write]", {
    userId,
    bytes: file.size,
    type: file.type,
    source: source.dataUrl
      ? "dataUrl"
      : source.presetUrl
        ? "preset"
        : "https",
  });

  const client = await clerkClient();
  const updated = await client.users.updateUserProfileImage(userId, { file });
  const imageUrl = updated.imageUrl?.trim() || null;

  const db = getDb();
  await db
    .update(users)
    .set({ imageUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  const live = await getLiveProfile(userId);
  console.info("[profile.saveAvatar.readback]", {
    userId,
    imageUrl: live.imageUrl ? `${live.imageUrl.slice(0, 80)}…` : null,
    hasAvatar: isRealAvatarUrl(live.imageUrl),
  });

  if (!isRealAvatarUrl(live.imageUrl)) {
    throw new Error("Avatar did not save to your profile. Please try again.");
  }

  return live;
}
