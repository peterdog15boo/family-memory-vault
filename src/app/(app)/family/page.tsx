import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { FamilySettingsPanel } from "@/components/family/FamilySettingsPanel";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { getTranslations } from "@/lib/i18n/server";
import {
  getFamilyMembersWithProfiles,
  getUserFamilies,
} from "@/lib/families";
import { getFamilyMemberLocations } from "@/lib/location";
import type { FamilyLocationsPayload } from "@/lib/location/types";
import {
  serializeFamilyMemberForViewer,
  serializeFamilyWithMembership,
  type SerializedFamilyMember,
} from "@/lib/families/serialize";
import { getPlanCapabilities } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

/**
 * Family settings — members, invites, roles, leave/create.
 */
export default async function FamilyPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const t = await getTranslations();

  await ensureAppUser(userId);
  const [families, capabilities] = await Promise.all([
    getUserFamilies(userId),
    getPlanCapabilities(userId),
  ]);
  const serialized = families.map(serializeFamilyWithMembership);

  const membersByFamilyId: Record<string, SerializedFamilyMember[]> = {};
  const locationsByFamilyId: Record<string, FamilyLocationsPayload> = {};

  await Promise.all(
    families.map(async (family) => {
      const viewerIsOwner = family.membership.role === "owner";
      const [members, locationPayload] = await Promise.all([
        getFamilyMembersWithProfiles(family.id),
        getFamilyMemberLocations(family.id, userId),
      ]);
      membersByFamilyId[family.id] = members.map((member) =>
        serializeFamilyMemberForViewer(member, { viewerIsOwner }),
      );
      locationsByFamilyId[family.id] = locationPayload;
    }),
  );

  return (
    <>
      <AppPageIntro
        slot="family"
        title={
          <>
            {t("pages.familyTitle")}{" "}
            <HintTooltip
              tip={t("tips.familyShare")}
              label={t("pages.familyAbout")}
            />
          </>
        }
        description={t("pages.familyDescription")}
      />

      <div className="app-page mx-auto max-w-3xl">
        <FamilySettingsPanel
          viewerUserId={userId}
          families={serialized}
          membersByFamilyId={membersByFamilyId}
          locationsByFamilyId={locationsByFamilyId}
          capabilities={capabilities}
        />

        <p className="mt-10 flex gap-2 text-xs leading-relaxed text-ink-muted">
          <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          Owners manage who&apos;s invited. Photos that aren&apos;t ready yet stay
          private. Faces stay private to each person&apos;s account.
        </p>
      </div>
    </>
  );
}
