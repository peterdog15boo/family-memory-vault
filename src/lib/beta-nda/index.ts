/**
 * Beta Tester NDA acceptance — DB is source of truth for signed-in users.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { betaNdaAcceptances } from "@/lib/db/schema";
import {
  BETA_NDA_COOKIE,
  BETA_NDA_VERSION,
  isBetaNdaRequired,
} from "@/lib/beta-nda/constants";

export { BETA_NDA_COOKIE, BETA_NDA_VERSION, isBetaNdaRequired };

export type RecordBetaNdaAcceptanceInput = {
  userId: string;
  fullName: string;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  ndaVersion?: string;
};

/**
 * True when this user has accepted the current (or given) NDA version.
 */
export const hasAcceptedBetaNda = cache(
  async (
    userId: string,
    ndaVersion: string = BETA_NDA_VERSION,
  ): Promise<boolean> => {
    const db = getDb();
    const [row] = await db
      .select({ id: betaNdaAcceptances.id })
      .from(betaNdaAcceptances)
      .where(
        and(
          eq(betaNdaAcceptances.userId, userId),
          eq(betaNdaAcceptances.ndaVersion, ndaVersion),
        ),
      )
      .limit(1);
    return Boolean(row);
  },
);

/**
 * Persist clickwrap acceptance. Idempotent per (userId, ndaVersion).
 */
export async function recordBetaNdaAcceptance(
  input: RecordBetaNdaAcceptanceInput,
) {
  const ndaVersion = input.ndaVersion?.trim() || BETA_NDA_VERSION;
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const [row] = await db
    .insert(betaNdaAcceptances)
    .values({
      id,
      userId: input.userId,
      fullName,
      email,
      ndaVersion,
      acceptedAt: now,
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim()?.slice(0, 512) || null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [betaNdaAcceptances.userId, betaNdaAcceptances.ndaVersion],
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

/** Cookie options for the NDA acceptance supplement. */
export function betaNdaCookieOptions() {
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
