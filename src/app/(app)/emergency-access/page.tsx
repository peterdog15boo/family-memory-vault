import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { EmergencyAccessIncomingPanel } from "@/components/emergency-access/EmergencyAccessIncomingPanel";
import { listIncomingEmergencyDesignations } from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { ensureAppUser } from "@/lib/users";

export default async function EmergencyAccessPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const rows = await listIncomingEmergencyDesignations(userId);

  return (
    <EmergencyAccessIncomingPanel
      designations={rows.map((row) =>
        serializeEmergencyAccessDesignation(row, {
          ownerDisplayName: row.ownerDisplayName,
        }),
      )}
    />
  );
}
