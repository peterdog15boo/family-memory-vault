/**
 * Shared product microcopy — warm, clear, family-oriented.
 *
 * Prefer `useCopy()` / `getTranslations()` for locale-aware UI.
 * This English catalog remains as a fallback for code that has not
 * migrated yet. Do not hardcode new user-facing strings — add keys
 * under `src/lib/i18n/dictionaries/` instead.
 *
 * Voice: plain language for average users. Warm, calm, modern,
 * loving, trustworthy. Avoid technical jargon in normal UI.
 */

export const COPY = {
  upload: {
    dropTitle: "Drop photos or videos here",
    dropBody:
      "We’ll keep them private and look them over before they show up for your family.",
    chooseFiles: "Choose files",
    safetyNote:
      "Every upload stays private while it is scanned. Ready photos appear in your library automatically.",
    status: {
      queued: "Waiting to start…",
      requesting_url: "Getting ready…",
      uploading: (pct: number) => `Uploading… ${pct}%`,
      finalizing: "Saving your file…",
      done: "Got it — we’ll take a quick look, then it’ll appear in your photos.",
      error: "Something went wrong with this upload. Try again.",
    },
  },
  review: {
    pendingOne:
      "One photo is still being checked. It’ll show up when it’s ready.",
    pendingMany: (n: number) =>
      `${n} photos are still being checked. They’ll show up when they’re ready.`,
    attention:
      "A few uploads need a closer look and aren’t in your photos yet. Everything else is ready to browse.",
    mixed:
      "Some uploads are still being checked. Your photos only show items that are ready.",
  },
  movie: {
    status: {
      queued: "Waiting…",
      processing: "Making your movie…",
      failed: "Couldn’t finish",
      ready: "Ready",
    },
    craftingTitle: "Making your movie",
    craftingBody: "Gathering your favorite moments into a short film.",
    craftingHint:
      "Most movies take a few minutes. You can leave this page open — we’ll keep working.",
    waiting: "Waiting to start…",
    rendering: "Putting it together…",
    preparing: "Almost there…",
    readyTitle: "Your movie is ready",
    failedTitle: "We couldn’t finish this movie",
    failedRetry: "Try again",
    emptyMedia:
      "Add a few photos to this memory first, then come back to make a movie.",
  },
  empty: {
    memoriesFirst: {
      title: "Start your first memory",
      description:
        "Gather photos into a warm album your family can revisit together.",
    },
    memoriesDefault: {
      title: "No memories yet",
      description:
        "Create an album for a birthday, holiday, or ordinary Tuesday — whatever matters.",
    },
    memoriesShared: {
      title: "Nothing shared with family yet",
      description:
        "When someone shares an album with you, it’ll appear here.",
    },
    mediaOwn: {
      title: "Add your first photos",
      description:
        "Upload a few from your phone or computer. We’ll keep them private until they’re ready.",
    },
    mediaShared: {
      title: "No shared photos yet",
      description:
        "When family members share photos, they’ll show up here.",
    },
    people: {
      title: "Faces will gather here",
      description:
        "Upload photos of the people you love. We’ll gently group faces so you can put names to them — private to you.",
    },
    movies: {
      title: "No movies yet",
      description:
        "Open a memory and tap Make a movie — we’ll turn those photos into a short film.",
    },
    moviesMemory: {
      title: "No movie from this memory yet",
      description:
        "Pick a theme and we’ll make a short film from these photos — lovely to share with family.",
    },
    familyMembers: {
      title: "Just you for now",
      description:
        "Invite someone you trust when you’re ready. Shared memories stay in the family.",
    },
    notifications: {
      title: "You’re all caught up",
      description:
        "We’ll let you know when photos are ready, a movie finishes, storage runs low, or someone invites you.",
    },
    createMemoryNoMedia: {
      title: "No photos ready yet",
      description:
        "Upload a few photos first. When they’re ready, come back to build your album.",
    },
    documentsCategory: {
      title: "Nothing here yet",
      description:
        "Add a policy, statement, or ID to this folder. These files stay private to you — never shared with family.",
    },
    documentsSearch: {
      title: "No matching documents",
      description:
        "Try another title or tag, or clear the search to see everything in this folder.",
    },
  },
  tips: {
    moderation:
      "We look over each upload for safety. Only ready photos appear in Memories, Movies, and family sharing.",
    createMovie:
      "Movies use the photos already in this memory. New uploads join in after they’re ready.",
    peopleFaces:
      "We only group faces from ready photos, and it stays private to your account.",
    familyShare:
      "Sharing a memory lets family view it. Contribute access also lets them add photos.",
    storageQuota:
      "Storage counts the files you’ve uploaded. Freeing space or upgrading gives you more room.",
    privateDocuments:
      "Private Documents are only for you. They never appear in Memories, Movies, or family sharing.",
    digitalLegacy:
      "Digital Legacy is a private gift of clarity — only you can see it until you choose otherwise. It never appears in family sharing.",
  },
  legacy: {
    title: "Digital Legacy",
    subtitle: "In case I’m gone",
    overviewLead:
      "This is a calm place to leave thoughtful guidance for the people you love — contacts, instructions, and access notes that can lighten their load during a difficult time.",
    overviewPrivacy:
      "Everything here stays private to your account. You’re not preparing for the worst; you’re offering clarity as an act of care.",
    secureWarning:
      "These notes may contain passwords or sensitive access details. Keep this section updated, and share access only with someone you trust completely.",
    secureWarningShort:
      "Treat this like a locked drawer — visible only to you in this vault.",
    secureRevealConfirm:
      "Reveal sensitive content? You may need to verify your sign-in. This view is logged for your security.",
    documentDownloadConfirm:
      "Download this private document? Access is short-lived and logged for your security.",
    documentViewConfirm:
      "View this private document in the vault? Access is logged for your security.",
  },
} as const;
