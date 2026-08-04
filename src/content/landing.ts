/**
 * Editable marketing landing copy & media config.
 * Media paths come from `landing-media.ts` — replace the named slot files under
 * `/public/cinematic/` (or update that registry).
 *
 * Modern landing is cinematic / media-first — see LandingModern.
 * Background treatments: `src/lib/media-section/treatments.ts`
 */

import type { MediaSectionTreatmentId } from "@/lib/media-section/treatments";
import type { MediaOverlayId } from "@/lib/media-section/overlays";
import { LANDING_MEDIA } from "@/content/landing-media";

export type LandingCta = {
  label: string;
  href: string;
};

export type LandingStoryStageLayout = "center" | "split-start" | "split-end";

export type LandingStoryStage = {
  id: string;
  layout: LandingStoryStageLayout;
  eyebrow: string;
  title: string;
  body: string;
  treatment: MediaSectionTreatmentId;
  /** Side-panel atmosphere for split layouts */
  mediaTone: "warm" | "sage" | "rose" | "dusk";
  cta?: LandingCta;
  backgroundImage?: string | null;
  backgroundVideo?: string | null;
  backgroundImageFallback?: string | null;
  imageAlt?: string;
};

export type LandingTrustItem = {
  title: string;
  body: string;
};

export type LandingHowStep = {
  title: string;
  body: string;
};

export type LandingPricingTeaserPlan = {
  name: string;
  price: string;
  note: string;
  highlighted?: boolean;
};

export const landingContent = {
  brand: "Family Memory Vault",

  hero: {
    treatment: "heroWarm" as MediaSectionTreatmentId,
    /** Centered cinematic veil — readable over video or photo */
    overlay: "hero-cinematic" as MediaOverlayId,
    headline: "Keep what love leaves behind.",
    support:
      "A calm private home for the photos, stories, and keepsakes your family will want to hold onto for years.",
    primaryCta: {
      label: "Begin your vault",
      href: "/sign-up",
    } satisfies LandingCta,
    secondaryCta: {
      label: "See how it feels",
      href: "#promise",
    } satisfies LandingCta,
    scrollLabel: "Continue",
    scrollHref: "#promise",
    backgroundImage: LANDING_MEDIA.hero.image,
    backgroundVideo: LANDING_MEDIA.hero.video,
    backgroundImageFallback: LANDING_MEDIA.hero.image,
  },

  promise: {
    id: "promise",
    treatment: "promiseQuiet" as MediaSectionTreatmentId,
    eyebrow: "Preserve what matters",
    headline: "Hold onto the moments you never want to lose.",
    support:
      "Gather photos, stories, and quiet family keepsakes in one place made for keeping, not scrolling past.",
    backgroundImage: LANDING_MEDIA.promise.image,
    backgroundVideo: null as string | null,
    backgroundImageFallback: LANDING_MEDIA.promise.image,
  },

  /**
   * Full-viewport cinematic stages — each scroll stop is one emotional beat.
   * All layouts are full-bleed bands (no inset split cards).
   */
  storyStages: [
    {
      id: "privacy",
      layout: "split-end",
      eyebrow: "Private by design",
      title: "Your family. Not a feed.",
      body: "No public profiles, no performative sharing, no ads wrapped around your memories. Just the people you invite.",
      treatment: "featureSoft" as MediaSectionTreatmentId,
      mediaTone: "sage",
      cta: {
        label: "See pricing",
        href: "/pricing",
      },
      backgroundImage: LANDING_MEDIA.privacy.image,
      backgroundVideo: null,
      backgroundImageFallback: LANDING_MEDIA.privacy.image,
      imageAlt: LANDING_MEDIA.privacy.alt,
    },
    {
      id: "movies",
      layout: "split-start",
      eyebrow: "Movies",
      title: "Turn moments into movies worth watching together.",
      body: "Create gentle films from the photos you already love, so birthdays, trips, and everyday memories feel alive again.",
      treatment: "bandRose" as MediaSectionTreatmentId,
      mediaTone: "rose",
      cta: {
        label: "Make your first movie",
        href: "/sign-up",
      },
      backgroundImage: LANDING_MEDIA.movies.image,
      backgroundVideo: null,
      backgroundImageFallback: LANDING_MEDIA.movies.image,
      imageAlt: LANDING_MEDIA.movies.alt,
    },
    {
      id: "family-share",
      layout: "split-end",
      eyebrow: "Family",
      title: "Share with family, gently and intentionally.",
      body: "Invite the people who matter, keep roles clear, and share only what feels right for your household.",
      treatment: "bandWarm" as MediaSectionTreatmentId,
      mediaTone: "dusk",
      cta: {
        label: "Create your space",
        href: "/sign-up",
      },
      backgroundImage: LANDING_MEDIA.familyShare.image,
      backgroundVideo: null,
      backgroundImageFallback: LANDING_MEDIA.familyShare.image,
      imageAlt: LANDING_MEDIA.familyShare.alt,
    },
    {
      id: "legacy",
      layout: "center",
      eyebrow: "Peace of mind",
      title: "Leave love behind with care.",
      body: "Keep messages, guidance, and important family details in one calm place for the people who may need them someday.",
      treatment: "legacyDusk" as MediaSectionTreatmentId,
      mediaTone: "dusk",
      cta: {
        label: "Start free",
        href: "/sign-up",
      },
      backgroundImage: LANDING_MEDIA.legacy.image,
      backgroundVideo: null,
      backgroundImageFallback: LANDING_MEDIA.legacy.image,
      imageAlt: LANDING_MEDIA.legacy.alt,
    },
  ] satisfies LandingStoryStage[],

  familyTrust: {
    id: "trust",
    treatment: "trustMist" as MediaSectionTreatmentId,
    eyebrow: "Family · Love · Trust",
    title: "Designed to feel safe",
    support:
      "Privacy and care are not upgrades — they are the foundation of every plan.",
    backgroundImage: LANDING_MEDIA.trust.image,
    backgroundVideo: null as string | null,
    backgroundImageFallback: LANDING_MEDIA.trust.image,
    items: [
      {
        title: "Consent & quiet sharing",
        body: "You choose who sees what. Sharing stays intentional — never broadcast.",
      },
      {
        title: "Safety for every age",
        body: "Uploads are moderated before they can appear in shared family spaces.",
      },
      {
        title: "Yours to keep",
        body: "A calm archive for photos, stories, documents, and messages that matter.",
      },
    ] satisfies LandingTrustItem[],
  },

  howItWorks: {
    id: "how-it-works",
    eyebrow: "How it works",
    title: "Three gentle steps",
    support: "Settle in at your own pace — nothing here asks you to perform.",
    steps: [
      {
        title: "Gather what you love",
        body: "Upload photos and videos into a private vault. Safety checks happen before anything is shared with family.",
      },
      {
        title: "Shape the story",
        body: "Create memories, slideshows, and keepsakes — or simply leave things organized for the people who matter.",
      },
      {
        title: "Invite with intention",
        body: "Bring household members in when you’re ready. Roles stay clear. Sharing stays quiet.",
      },
    ] satisfies LandingHowStep[],
  },

  pricingTeaser: {
    id: "pricing",
    eyebrow: "Plans",
    title: "Start free. Grow when you’re ready.",
    support:
      "Transparent limits for storage, family members, and movies — privacy on every plan.",
    plans: [
      {
        name: "Free",
        price: "$0",
        note: "Begin your vault",
      },
      {
        name: "Family",
        price: "From $9.99",
        note: "Recommended for households",
        highlighted: true,
      },
      {
        name: "Family Plus",
        price: "From $19.99",
        note: "More room to grow",
      },
    ] satisfies LandingPricingTeaserPlan[],
    cta: {
      label: "Compare plans",
      href: "/pricing",
    } satisfies LandingCta,
  },

  finalCta: {
    id: "get-started",
    treatment: "ctaGlow" as MediaSectionTreatmentId,
    glass: false,
    title: "Start your family’s vault.",
    support:
      "Create a warm private place for the memories, stories, and keepsakes that deserve to stay close.",
    backgroundImage: LANDING_MEDIA.finalCta.image,
    backgroundVideo: null as string | null,
    backgroundImageFallback: LANDING_MEDIA.finalCta.image,
    primaryCta: {
      label: "Start free",
      href: "/sign-up",
    } satisfies LandingCta,
    secondaryCta: {
      label: "See pricing",
      href: "/pricing",
    } satisfies LandingCta,
  },
} as const;
