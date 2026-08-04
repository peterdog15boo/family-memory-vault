import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { ensureAppUser } from "@/lib/users";
import {
  assertEmergencyLegacyReadAccess,
  getActiveEmergencyGrantForOwner,
} from "@/lib/emergency-access";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logSensitiveAccess } from "@/lib/security/sensitive-access";

type RouteContext = { params: Promise<{ ownerUserId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { ownerUserId } = await context.params;
  await ensureAppUser(userId);

  try {
    await assertEmergencyLegacyReadAccess(ownerUserId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const grant = await getActiveEmergencyGrantForOwner(ownerUserId, userId);
  if (!grant) {
    return new Response("Not found", { status: 404 });
  }

  const db = getDb();
  const [owner] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, ownerUserId))
    .limit(1);

  const vault = await loadLegacyVault(ownerUserId, { includeSecureContent: false });

  await logSensitiveAccess({
    userId,
    action: "emergency_access.vault_view",
    targetType: "legacy_vault",
    targetId: ownerUserId,
    metadata: { accessMode: "granted_emergency", exportMode: "packet" },
  });

  const ownerLabel = owner?.displayName?.trim() || "Vault owner";
  const lines = [
    `# ${ownerLabel} Emergency Packet`,
    "",
    "This export reflects the information currently available through authorized emergency access.",
    "Secure item contents remain hidden here and should be revealed individually in the app when needed.",
    "",
    `Progress: ${vault.progress.completed}/${vault.progress.total}`,
    "",
  ];

  if (vault.profile.summaryMessage || vault.profile.generalInstructions) {
    lines.push("## Message");
    if (vault.profile.summaryMessage) {
      lines.push(vault.profile.summaryMessage, "");
    }
    if (vault.profile.generalInstructions) {
      lines.push("### Additional instructions", vault.profile.generalInstructions, "");
    }
  }

  if (vault.contacts.length) {
    lines.push("## Key contacts");
    for (const contact of vault.contacts) {
      lines.push(
        `- ${contact.name}${contact.isPrimary ? " (Primary)" : ""} — ${contact.category}${contact.relationship ? `; ${contact.relationship}` : ""}${contact.phone ? `; ${contact.phone}` : ""}${contact.email ? `; ${contact.email}` : ""}`,
      );
    }
    lines.push("");
  }

  if (vault.instructions.length) {
    lines.push("## Instructions");
    for (const instruction of vault.instructions) {
      lines.push(`### ${instruction.title}`, instruction.content);
      if (instruction.attachedDocuments.length) {
        lines.push(
          `Attached documents: ${instruction.attachedDocuments.map((doc) => doc.title).join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  if (vault.videos.length) {
    lines.push("## Video messages");
    lines.push(
      "Titles only — open each video in the app for secure playback. Signed links are never included in this export.",
      "",
    );
    for (const video of vault.videos) {
      const duration =
        video.durationSeconds != null && video.durationSeconds >= 0
          ? ` (${Math.floor(video.durationSeconds / 60)}:${String(
              Math.floor(video.durationSeconds % 60),
            ).padStart(2, "0")})`
          : "";
      lines.push(
        `- ${video.title}${duration}${video.isPrimary ? " (featured)" : ""} — ${video.sectionType}`,
      );
    }
    lines.push("");
  }

  if (vault.secureItems.length) {
    lines.push("## Secure items");
    for (const item of vault.secureItems) {
      lines.push(
        `- ${item.label} (${item.itemType})${item.relatedDocumentTitle ? ` — related document: ${item.relatedDocumentTitle}` : ""}`,
      );
    }
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="emergency-packet-${ownerUserId}.md"`,
      "Cache-Control": "private, no-store",
    },
  });
}
