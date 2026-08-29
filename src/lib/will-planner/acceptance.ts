/**
 * Will Planner disclaimer clickwrap — DB is source of truth.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { willDisclaimerAcceptances } from "@/lib/db/schema";
import { WILL_DISCLAIMER_VERSION } from "@/lib/will-planner/constants";

export type RecordWillDisclaimerInput = {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  disclaimerVersion?: string;
};

export const hasAcceptedWillDisclaimer = cache(
  async (
    userId: string,
    disclaimerVersion: string = WILL_DISCLAIMER_VERSION,
  ): Promise<boolean> => {
    const db = getDb();
    const [row] = await db
      .select({ id: willDisclaimerAcceptances.id })
      .from(willDisclaimerAcceptances)
      .where(
        and(
          eq(willDisclaimerAcceptances.userId, userId),
          eq(
            willDisclaimerAcceptances.disclaimerVersion,
            disclaimerVersion,
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  },
);

export async function recordWillDisclaimerAcceptance(
  input: RecordWillDisclaimerInput,
) {
  const disclaimerVersion =
    input.disclaimerVersion?.trim() || WILL_DISCLAIMER_VERSION;
  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const [row] = await db
    .insert(willDisclaimerAcceptances)
    .values({
      id,
      userId: input.userId,
      disclaimerVersion,
      acceptedAt: now,
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim()?.slice(0, 512) || null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        willDisclaimerAcceptances.userId,
        willDisclaimerAcceptances.disclaimerVersion,
      ],
      set: {
        acceptedAt: now,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim()?.slice(0, 512) || null,
      },
    })
    .returning();

  return row;
}
