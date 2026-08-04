import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { GrantedLegacyView } from "@/components/emergency-access/GrantedLegacyView";
import {
  assertEmergencyLegacyReadAccess,
  getActiveEmergencyGrantForOwner,
} from "@/lib/emergency-access";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureAppUser } from "@/lib/users";

type PageProps = {
  params: Promise<{ ownerUserId: string }>;
};

export default async function GrantedLegacyPage({ params }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  const { ownerUserId } = await params;
  await ensureAppUser(userId);

  try {
    await assertEmergencyLegacyReadAccess(ownerUserId, userId);
  } catch {
    notFound();
  }

  const grant = await getActiveEmergencyGrantForOwner(ownerUserId, userId);
  if (!grant) notFound();

  const db = getDb();
  const [owner] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1);

  const vault = await loadLegacyVault(ownerUserId, { includeSecureContent: false });

  return (
    <GrantedLegacyView
      ownerUserId={ownerUserId}
      ownerDisplayName={owner?.displayName ?? null}
      vault={vault}
      grantExpiresAt={grant.grantExpiresAt?.toISOString() ?? null}
      accessType={grant.accessType}
    />
  );
}
