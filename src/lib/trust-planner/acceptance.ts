/**
 * Trust Planner disclaimer clickwrap — DB is source of truth.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { trustDisclaimerAcceptances } from "@/lib/db/schema";
import { TRUST_DISCLAIMER_VERSION } from "@/lib/trust-planner/constants";

export type RecordTrustDisclaimerInput = {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  disclaimerVersion?: string;
};

export const hasAcceptedTrustDisclaimer = cache(
  async (
    userId: string,
    disclaimerVersion: string = TRUST_DISCLAIMER_VERSION,
  ): Promise<boolean> => {
    const db = getDb();
    const [row] = await db
      .select({ id: trustDisclaimerAcceptances.id })
      .from(trustDisclaimerAcceptances)
      .where(
        and(
          eq(trustDisclaimerAcceptances.userId, userId),
          eq(
            trustDisclaimerAcceptances.disclaimerVersion,
            disclaimerVersion,
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  },
);

export async function recordTrustDisclaimerAcceptance(
  input: RecordTrustDisclaimerInput,
) {
  const disclaimerVersion =
    input.disclaimerVersion?.trim() || TRUST_DISCLAIMER_VERSION;
  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const [row] = await db
    .insert(trustDisclaimerAcceptances)
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
        trustDisclaimerAcceptances.userId,
        trustDisclaimerAcceptances.disclaimerVersion,
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
