import { Heart } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { FacePrivacyNote } from "@/components/people/FacePrivacyNote";
import { PeopleList } from "@/components/people/PeopleList";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { getTranslations } from "@/lib/i18n/server";
import { getPlanCapabilities } from "@/lib/plans/gates";
import { listPeopleWithCovers, serializePersonListItem } from "@/lib/people/queries";

/**
 * Faces found in your vault, gathered into people you can name and merge.
 */
export default async function PeoplePage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const t = await getTranslations();

  const [peopleRaw, capabilities] = await Promise.all([
    listPeopleWithCovers(userId),
    getPlanCapabilities(userId),
  ]);
  const people = peopleRaw.map(serializePersonListItem);
  const maxPeople = capabilities.maxPeople;
  const atPeopleLimit = maxPeople != null && people.length >= maxPeople;

  const peopleMeta = (
    <>
      <FacePrivacyNote className="mt-4 max-w-xl" />
      {people.length > 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          {people.length}
          {maxPeople != null ? ` of ${maxPeople}` : ""}{" "}
          {people.length === 1 ? "person" : "people"}
          {maxPeople == null ? " found" : " on your plan"}
        </p>
      ) : null}
      {atPeopleLimit ? (
        <div className="mt-4 max-w-xl">
          <UpgradePrompt
            title="People limit reached"
            message={`You've reached ${maxPeople} people on the ${capabilities.planName} plan. New faces won't create additional people until you free a spot or upgrade.`}
            hint="Upgrade to keep more people in your vault."
          />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <AppPageIntro
        slot="people"
        eyebrow={
          <>
            <Heart className="size-3.5" aria-hidden />
            {t("pages.peopleEyebrow")}
          </>
        }
        title={
          <>
            {t("pages.peopleTitle")}{" "}
            <HintTooltip tip={t("tips.peopleFaces")} label={t("pages.peopleAbout")} />
          </>
        }
        description={t("pages.peopleDescription")}
        originalExtra={peopleMeta}
        modernExtra={peopleMeta}
      />

      <div className="app-page app-page--people app-stack mx-auto max-w-6xl">
        <section className="family-photo-area">
          <PeopleList people={people} className="people-gallery" />
        </section>
      </div>
    </>
  );
}
