import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyOverview } from "@/components/legacy/LegacyOverview";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyOverviewPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const vault = await loadLegacyVault(userId);

  return (
    <LegacyShell>
      <LegacyOverview progress={vault.progress} />
    </LegacyShell>
  );
}
