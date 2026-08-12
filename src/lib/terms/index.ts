/**
 * Terms of Service acceptance — DB is source of truth for signed-in users.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { termsAcceptances } from "@/lib/db/schema";
import {
  TERMS_COOKIE,
  TERMS_VERSION,
  isTermsRequired,
} from "@/lib/terms/constants";

export { TERMS_COOKIE, TERMS_VERSION, isTermsRequired };

export type RecordTermsAcceptanceInput = {
  userId: string;
  fullName: string;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  termsVersion?: string;
};

/**
 * True when this user has accepted the current (or given) Terms version.
 */
export const hasAcceptedTerms = cache(
  async (
    userId: string,
    termsVersion: string = TERMS_VERSION,
  ): Promise<boolean> => {
    const db = getDb();
    const [row] = await db
      .select({ id: termsAcceptances.id })
      .from(termsAcceptances)
      .where(
        and(
          eq(termsAcceptances.userId, userId),
          eq(termsAcceptances.termsVersion, termsVersion),
        ),
      )
      .limit(1);
    return Boolean(row);
  },
);

/**
 * Persist clickwrap acceptance. Idempotent per (userId, termsVersion).
 */
export async function recordTermsAcceptance(input: RecordTermsAcceptanceInput) {
  const termsVersion = input.termsVersion?.trim() || TERMS_VERSION;
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const [row] = await db
    .insert(termsAcceptances)
    .values({
      id,
      userId: input.userId,
      fullName,
      email,
      termsVersion,
      acceptedAt: now,
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim()?.slice(0, 512) || null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [termsAcceptances.userId, termsAcceptances.termsVersion],
      set: {
        fullName,
        email,
        acceptedAt: now,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim()?.slice(0, 512) || null,
      },
    })
    .returning();

  return row;
}

/** Cookie options for the Terms acceptance supplement. */
export function termsCookieOptions() {
  const secure =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL_URL?.trim());
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 400, // ~13 months
  };
}
