import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { EmergencyAccessOwnerPanel } from "@/components/emergency-access/EmergencyAccessOwnerPanel";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { listOwnerEmergencyDesignations } from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyEmergencyAccessPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const rows = await listOwnerEmergencyDesignations(userId);

  return (
    <LegacyShell>
      <EmergencyAccessOwnerPanel
        designations={rows.map((row) => serializeEmergencyAccessDesignation(row))}
      />
    </LegacyShell>
  );
}
