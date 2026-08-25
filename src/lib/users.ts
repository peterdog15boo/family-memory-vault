import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { users, type UserOnboardingState } from "@/lib/db/schema";
import { queueWelcomeEmail } from "@/lib/email/lifecycle";

/**
 * Ensure the Clerk user has a corresponding row in our users table.
 * Sends a welcome email the first time the row is created.
 */
export async function ensureAppUser(userId: string) {
  const db = getDb();
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("Authenticated user is missing an email address.");
  }

  const displayName =
    clerkUser?.fullName ||
    clerkUser?.firstName ||
    clerkUser?.username ||
    email;
  const imageUrl = clerkUser?.imageUrl ?? null;
  const now = new Date();

  const [existing] = await db
    .select({ id: users.id, onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const isNew = !existing;

  const [row] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      displayName,
      imageUrl,
      onboarding: { eligible: true },
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      // Keep app-chosen display name / avatar (Ava setup); only refresh email + activity.
      set: {
        email,
        lastActiveAt: now,
        updatedAt: now,
      },
    })
    .returning();

  // Backfill ritual eligibility when `eligible` was never set (null/undefined).
  // Do not override an explicit `eligible: false` opt-out or a completed ritual.
  if (!isNew && existing) {
    const onboarding = (existing.onboarding ?? null) as UserOnboardingState | null;
    const eligibleMissing =
      !onboarding ||
      (onboarding.eligible !== true && onboarding.eligible !== false);
    if (eligibleMissing && !onboarding?.firstFamilyMovieCompletedAt) {
      await db
        .update(users)
        .set({
          onboarding: { ...(onboarding ?? {}), eligible: true },
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    }
  }

  if (isNew) {
    queueWelcomeEmail({
      email,
      firstName: clerkUser?.firstName || displayName.split(/\s+/)[0] || null,
    });
  }

  return row;
}
