import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyMessagePacket } from "@/components/legacy/LegacyMessagePacket";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { listLegacyVideosBySection } from "@/lib/legacy/videos";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyMessagePage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const [vault, sectionVideos] = await Promise.all([
    loadLegacyVault(userId),
    listLegacyVideosBySection(userId, "message_to_loved_ones"),
  ]);

  return (
    <LegacyShell>
      <LegacyMessagePacket
        profile={vault.profile}
        initialVideos={sectionVideos.map((row) => serializeLegacyVideo(row))}
      />
    </LegacyShell>
  );
}
