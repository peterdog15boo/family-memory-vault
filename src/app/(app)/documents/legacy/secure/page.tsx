import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacySecureItemsPanel } from "@/components/legacy/LegacySecureItemsPanel";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { ensureAppUser } from "@/lib/users";

export default async function LegacySecurePage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const vault = await loadLegacyVault(userId);

  return (
    <LegacyShell>
      <LegacySecureItemsPanel
        secureItems={vault.secureItems}
        documentOptions={vault.documentOptions}
      />
    </LegacyShell>
  );
}
