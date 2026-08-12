/**
 * Seed script for local/dev databases.
 *
 * Usage:
 *   npm run db:seed
 *
 * Requires DATABASE_URL (or DATABASE_URL_UNPOOLED) in .env.local.
 * Safe sample data only — never seeds harmful content.
 */

import { config } from "dotenv";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  media,
  memories,
  memoryMedia,
  moderationEvents,
  users,
} from "@/lib/db/schema";
import { seedAchievements } from "@/lib/gamification";
import { ensureFreeSubscription, seedPlans } from "@/lib/plans";

config({ path: ".env.local", override: true });
config({ override: true });

async function seed() {
  const db = getDb();
  const now = new Date();

  const userId = "user_seed_demo";
  const photoId = nanoid();
  const videoId = nanoid();
  const memoryId = nanoid();
  const eventId = nanoid();

  console.log("Seeding Family Memory Vault…");

  const planRows = await seedPlans();
  console.log(
    `Plans: ${planRows.map((p) => p.slug).join(", ") || "(none)"}`,
  );

  const achievementRows = await seedAchievements();
  console.log(`Achievements: ${achievementRows.length} definitions`);

  await db
    .insert(users)
    .values({
      id: userId,
      email: "demo@familymemoryvault.local",
      displayName: "Demo Family",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        displayName: "Demo Family",
        updatedAt: now,
      },
    });

  await db
    .insert(media)
    .values([
      {
        id: photoId,
        userId,
        type: "photo",
        contentType: "image/jpeg",
        byteSize: 1_240_000,
        width: 2400,
        height: 1800,
        originalFilename: "beach-day.jpg",
        originalKey: `uploads/${userId}/${photoId}/original.jpg`,
        processedKey: `uploads/${userId}/${photoId}/processed.jpg`,
        thumbnailKey: `uploads/${userId}/${photoId}/thumb.jpg`,
        status: "ready",
        moderationStatus: "clean",
        moderationLabels: {
          provider: "seed",
          labels: ["safe", "family"],
          categories: { nudity: 0.01, violence: 0.0 },
        },
        photodnaMatch: false,
        aiCsamScore: 0.001,
        aiNudityScore: 0.01,
        lastViewedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: videoId,
        userId,
        type: "video",
        contentType: "video/mp4",
        byteSize: 18_500_000,
        width: 1920,
        height: 1080,
        durationMs: 42_000,
        originalFilename: "birthday-clip.mp4",
        // Placeholder keys only — seed does not upload to R2, so do not
        // enqueue moderation/scene jobs that would fail with NoSuchKey.
        originalKey: `uploads/${userId}/${videoId}/original.mp4`,
        processedKey: null,
        thumbnailKey: null,
        status: "ready",
        moderationStatus: "clean",
        moderationLabels: {
          provider: "seed",
          labels: ["safe", "family"],
        },
        photodnaMatch: false,
        aiCsamScore: 0.001,
        aiNudityScore: 0.01,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(memories)
    .values({
      id: memoryId,
      userId,
      type: "album",
      title: "Summer 2026",
      description: "A quiet album of family moments.",
      coverMediaId: photoId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(memoryMedia)
    .values([
      {
        memoryId,
        mediaId: photoId,
        sortOrder: 0,
        caption: "Morning light on the pier",
        addedAt: now,
      },
      {
        memoryId,
        mediaId: videoId,
        sortOrder: 1,
        caption: "Birthday candles",
        addedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(moderationEvents)
    .values({
      id: eventId,
      mediaId: photoId,
      eventType: "scan.completed",
      source: "seed",
      previousStatus: "pending_moderation",
      newStatus: "ready",
      previousModerationStatus: "pending",
      newModerationStatus: "clean",
      labels: {
        provider: "seed",
        labels: ["safe", "family"],
      },
      aiCsamScore: 0.001,
      aiNudityScore: 0.01,
      photodnaMatch: false,
      actorId: userId,
      notes: "Seeded clean moderation outcome for local development.",
      createdAt: now,
    })
    .onConflictDoNothing();

  const freeSub = await ensureFreeSubscription(userId);
  console.log(`Subscription: plan=${freeSub.planId} status=${freeSub.status}`);

  console.log("Seed complete.");
  console.log({ userId, photoId, videoId, memoryId, eventId });
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
