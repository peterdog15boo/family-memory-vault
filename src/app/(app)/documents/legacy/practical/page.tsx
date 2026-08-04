import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyInstructionsPanel } from "@/components/legacy/LegacyInstructionsPanel";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { LEGACY_PRACTICAL_HINTS } from "@/lib/legacy/nav";
import { listLegacyVideos } from "@/lib/legacy/videos";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyPracticalPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const vault = await loadLegacyVault(userId);
  const sectionOptions = new Set(
    LEGACY_PRACTICAL_HINTS.map((h) => h.sectionType as LegacyVideoSectionType),
  );
  const allVideos = await listLegacyVideos(userId);
  const videos = allVideos
    .filter((row) => sectionOptions.has(row.sectionType))
    .map((row) => serializeLegacyVideo(row));

  return (
    <LegacyShell>
      <LegacyInstructionsPanel
        title="Practical Instructions"
        lead="Everyday details about home, finances, insurance, accounts, and where important papers live — in writing, and with optional videos if that feels easier."
        hints={LEGACY_PRACTICAL_HINTS}
        instructions={vault.instructions}
        documentOptions={vault.documentOptions}
        videos={videos}
        allowRecordVideos
      />
    </LegacyShell>
  );
}
