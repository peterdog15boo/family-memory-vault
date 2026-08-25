/**
 * Education slides shown while the first family movie renders.
 */

export type FirstFamilyMovieWaitSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Optional screenshot-style image from public/. */
  imageSrc?: string;
  imageAlt?: string;
  accent: string;
};

export const FIRST_FAMILY_MOVIE_WAIT_SLIDES: readonly FirstFamilyMovieWaitSlide[] =
  [
    {
      id: "ask-ai",
      eyebrow: "Ask AI",
      title: "“Show me photos of Mom at the beach”",
      body: "Ask in plain language. Ava finds faces, places, and moments across your vault.",
      imageSrc: "/app-heroes/assistant.jpg",
      imageAlt: "Ask AI assistant",
      accent: "#5b8a7a",
    },
    {
      id: "people",
      eyebrow: "People",
      title: "Faces become the people you love",
      body: "We gently group faces so you can name Mom, Dad, and the kids — then find them forever.",
      imageSrc: "/app-heroes/people.jpg",
      imageAlt: "People recognition",
      accent: "#b56f5e",
    },
    {
      id: "family",
      eyebrow: "Family",
      title: "Invite family to contribute",
      body: "Share a calm invite. Relatives add photos and stories without cluttering your day.",
      imageSrc: "/app-heroes/family.jpg",
      imageAlt: "Family invites",
      accent: "#7a6a58",
    },
    {
      id: "simple-mode",
      eyebrow: "Movies",
      title: "Simple Mode movies in minutes",
      body: "Soft transitions, face-aware framing, and gentle music — polished without the edit suite.",
      imageSrc: "/app-heroes/movies.jpg",
      imageAlt: "Simple Mode movies",
      accent: "#4a6fa5",
    },
    {
      id: "private",
      eyebrow: "Privacy",
      title: "A private, safe vault",
      body: "Your memories stay yours. Shared only with the people you choose.",
      imageSrc: "/cinematic/section-private.jpg",
      imageAlt: "Private vault",
      accent: "#3d5a4c",
    },
    {
      id: "family-chat",
      eyebrow: "Family Chat",
      title: "Keep everyone in the loop",
      body: "Message family, ask for photos, and share updates in one calm place — without group-text chaos.",
      imageSrc: "/app-heroes/notifications.jpg",
      imageAlt: "Family Chat",
      accent: "#5a7a8a",
    },
    {
      id: "legacy",
      eyebrow: "Legacy",
      title: "Digital Legacy, when you’re ready",
      body: "Quiet tools for the hard day — so love isn’t lost in a password list.",
      imageSrc: "/app-heroes/legacy.jpg",
      imageAlt: "Digital Legacy",
      accent: "#6b5a7a",
    },
  ] as const;

/** Comfortable read time per slide while the movie renders (~12s). */
export const FFM_WAIT_SLIDE_MS = 12_000;
