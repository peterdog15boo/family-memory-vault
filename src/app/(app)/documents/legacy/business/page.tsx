import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyInstructionsPanel } from "@/components/legacy/LegacyInstructionsPanel";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { LEGACY_BUSINESS_HINTS } from "@/lib/legacy/nav";
import { listLegacyVideos } from "@/lib/legacy/videos";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyBusinessPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const vault = await loadLegacyVault(userId);
  const sectionOptions = new Set(
    LEGACY_BUSINESS_HINTS.map((h) => h.sectionType as LegacyVideoSectionType),
  );
  const allVideos = await listLegacyVideos(userId);
  const videos = allVideos
    .filter((row) => sectionOptions.has(row.sectionType))
    .map((row) => serializeLegacyVideo(row));

  return (
    <LegacyShell>
      <LegacyInstructionsPanel
        title="Business Continuity"
        lead="Help the people you trust understand how your work should continue, transition, or close with care. Pair written notes with short walkthrough videos — a “Start Here” orientation, how to access key systems, who to call in the first 48 hours, and how customer communication should be handled."
        hints={LEGACY_BUSINESS_HINTS}
        instructions={vault.instructions}
        documentOptions={vault.documentOptions}
        videos={videos}
        allowRecordVideos
        videoIntent="operations"
      />
    </LegacyShell>
  );
}
