/**
 * Product help knowledge for Ask AI.
 * Keep entries aligned with real UI names, routes, and plan catalog.
 */

export type HelpTopicId =
  | "invite_family"
  | "upload_photos"
  | "photo_scanning"
  | "create_memory"
  | "create_movie"
  | "movie_limits"
  | "ask_ai_search"
  | "people_faces"
  | "private_documents"
  | "digital_legacy"
  | "will_planner"
  | "settings_profile"
  | "theme_switching"
  | "billing_upgrade"
  | "storage_limits";

export type HelpKnowledgeEntry = {
  id: HelpTopicId;
  topic: string;
  /** Keywords / phrases that help retrieval score this entry. */
  keywords: string[];
  summary: string;
  steps?: string[];
  relatedRoutes: Array<{ label: string; href: string }>;
  /** When true, answer may include the user’s live plan/movie/storage limits. */
  planAware?: boolean;
  notes?: string[];
};

/**
 * Seed help topics — plain language, current product UI (Photos, not Media).
 */
export const HELP_KNOWLEDGE: readonly HelpKnowledgeEntry[] = [
  {
    id: "invite_family",
    topic: "Invite family members",
    keywords: [
      "invite",
      "family",
      "members",
      "join",
      "share",
      "household",
      "add someone",
      "invitation",
      // Multilingual help cues
      "invitar",
      "invito",
      "familia",
      "famille",
      "einladen",
      "familie",
      "convidar",
      "invitare",
    ],
    summary:
      "Invite people you trust from the Family page. They’ll get an invitation to join your household vault.",
    steps: [
      "Open Family in the sidebar (or go to /family).",
      "Send an invite with their email and choose a role.",
      "They accept the invite to join. Ready photos can be shared with family; Memories stay private until you share them.",
    ],
    relatedRoutes: [{ label: "Family", href: "/family" }],
    planAware: true,
    notes: [
      "Family sharing and how many members you can invite depend on your plan.",
      "Photos that aren’t ready yet stay private until the quick safety check finishes.",
    ],
  },
  {
    id: "upload_photos",
    topic: "Upload photos",
    keywords: [
      "upload",
      "add photos",
      "add videos",
      "import",
      "drop",
      "camera roll",
      "photos page",
    ],
    summary:
      "Add photos and videos from Upload. They stay private during a quick safety check, then appear in Photos.",
    steps: [
      "Open Upload (or tap Add photos from Photos).",
      "Drop files or choose them from your device.",
      "Wait for the quick check — ready items show up in Photos automatically.",
    ],
    relatedRoutes: [
      { label: "Upload", href: "/upload" },
      { label: "Photos", href: "/media" },
    ],
  },
  {
    id: "photo_scanning",
    topic: "Why photos don’t show up right away",
    keywords: [
      "why",
      "don't show",
      "dont show",
      "not showing",
      "pending",
      "scanning",
      "safety check",
      "moderation",
      "wait",
      "right away",
      "appear",
      "ready",
    ],
    summary:
      "Every upload is scanned for safety before it appears in Photos, Memories, Movies, or family sharing. That’s intentional — it keeps the vault family-safe.",
    steps: [
      "Upload as usual from Upload.",
      "While checking, the file stays private and won’t show in Photos yet.",
      "When it’s ready, it appears in Photos automatically. You can keep browsing in the meantime.",
    ],
    relatedRoutes: [
      { label: "Photos", href: "/media" },
      { label: "Upload", href: "/upload" },
    ],
    notes: [
      "Only clean, ready photos are used in Memories, Movies, People, and Ask AI search.",
    ],
  },
  {
    id: "create_memory",
    topic: "Create a Memory",
    keywords: [
      "memory",
      "album",
      "collection",
      "create memory",
      "make a memory",
      "where.*memory",
    ],
    summary:
      "A Memory is a simple album of ready photos that tells a story. Create one from Memories.",
    steps: [
      "Open Memories in the sidebar.",
      "Tap Create a memory (or go to /memories/new).",
      "Choose ready photos from Photos, add a title, and save.",
      "Optionally share the Memory with family when you’re ready.",
    ],
    relatedRoutes: [
      { label: "Memories", href: "/memories" },
      { label: "Create Memory", href: "/memories/new" },
      { label: "Photos", href: "/media" },
    ],
  },
  {
    id: "create_movie",
    topic: "Create a Movie",
    keywords: [
      "movie",
      "slideshow",
      "film",
      "montage",
      "make a movie",
      "create movie",
      "tribute",
    ],
    summary:
      "Movies turn photos from a Memory into a short film. Open a Memory and choose Make a movie.",
    steps: [
      "Create or open a Memory that has a few ready photos.",
      "Tap Make a movie and pick a theme.",
      "We’ll render it in the background — you’ll get a notice when it’s ready on Movies.",
    ],
    relatedRoutes: [
      { label: "Memories", href: "/memories" },
      { label: "Movies", href: "/movies" },
    ],
    planAware: true,
    notes: [
      "Movies only use clean, ready photos already in that Memory.",
      "Your plan sets how many movies you can make each month.",
    ],
  },
  {
    id: "movie_limits",
    topic: "Movie monthly limits",
    keywords: [
      "more than",
      "5 movies",
      "movie limit",
      "movies per month",
      "quota",
      "cap",
      "upgrade movie",
      "how many movies",
    ],
    summary:
      "Each plan includes a monthly movie allowance. If you hit the cap, upgrade for a higher limit.",
    steps: [
      "Check your current plan and movie usage on Billing.",
      "If you’ve reached this month’s movie limit, upgrade to a plan with a higher monthly allowance.",
      "After upgrading, you can make more movies right away (within the new plan’s limit).",
    ],
    relatedRoutes: [
      { label: "Billing", href: "/billing" },
      { label: "Movies", href: "/movies" },
    ],
    planAware: true,
  },
  {
    id: "ask_ai_search",
    topic: "Ask AI photo search",
    keywords: [
      "ask ai",
      "search photos",
      "find photos",
      "show me",
      "visual search",
      "assistant",
    ],
    summary:
      "Ask AI can find your ready photos with plain language — people, places, objects, or seasons.",
    steps: [
      "Open Ask AI.",
      "Try prompts like “Show me beach photos”, “Photos with birthday cake”, or “Pictures of Grandpa fishing”.",
      "From results you can create a Memory or Movie when you’re ready.",
    ],
    relatedRoutes: [{ label: "Ask AI", href: "/assistant" }],
    notes: [
      "Ask AI only searches your clean, ready photos — never pending or private documents.",
    ],
  },
  {
    id: "people_faces",
    topic: "People and faces",
    keywords: [
      "people",
      "faces",
      "face",
      "label",
      "who is",
      "group faces",
      "assign",
      "person",
    ],
    summary:
      "People groups faces from your ready photos so you can put names to loved ones. It’s private to your account.",
    steps: [
      "Upload photos and wait until they’re ready in Photos.",
      "Open People to review suggested faces and add names.",
      "You can also assign a photo to a person from the photo viewer.",
    ],
    relatedRoutes: [
      { label: "People", href: "/people" },
      { label: "Photos", href: "/media" },
    ],
  },
  {
    id: "private_documents",
    topic: "Private Documents",
    keywords: [
      "documents",
      "private documents",
      "paperwork",
      "category",
      "file",
      "policy",
      "id",
    ],
    summary:
      "Private Documents are only for you — policies, IDs, and paperwork. They never appear in Memories, Movies, or family sharing.",
    steps: [
      "Open Documents in the sidebar (shown when you’re on Legacy+).",
      "Create a category if you need one, then upload or file a document.",
      "Use secure view/download when you need the file — access is logged for your safety.",
    ],
    relatedRoutes: [{ label: "Documents", href: "/documents" }],
    planAware: true,
    notes: [
      "Private Documents is part of the Legacy+ plan. Free and Family do not include it.",
    ],
  },
  {
    id: "digital_legacy",
    topic: "Digital Legacy",
    keywords: [
      "digital legacy",
      "legacy",
      "in case",
      "emergency",
      "executor",
      "contacts",
      "after i'm gone",
      "guidance",
      "connected accounts",
    ],
    summary:
      "Digital Legacy is a calm place to leave contacts, instructions, and notes for people you love. It stays private to your account until you choose otherwise.",
    steps: [
      "Open Digital Legacy from the sidebar when you’re on Legacy+ (or /documents/legacy).",
      "Add trusted contacts, practical instructions, and any guidance you want ready.",
      "Review the checklist so you can see what’s still missing.",
      "Optionally set up emergency access for someone you trust.",
    ],
    relatedRoutes: [
      { label: "Digital Legacy", href: "/documents/legacy" },
      { label: "Emergency Access", href: "/emergency-access" },
      { label: "Billing", href: "/billing" },
    ],
    planAware: true,
    notes: [
      "Digital Legacy, emergency access setup, and Connected Accounts are part of Legacy+.",
      "Secure notes may contain sensitive details — treat them like a locked drawer.",
      "Ask AI can help explain Legacy+, but it can’t unlock features your plan doesn’t include.",
    ],
  },
  {
    id: "will_planner",
    topic: "Will Planner",
    keywords: [
      "will planner",
      "will",
      "attorney draft",
      "estate planning",
      "executor",
      "residuary",
      "last will",
      "testament",
      "planning draft",
      "make this a real will",
      "signing checklist",
      "signed will",
      "wills estate",
    ],
    summary:
      "Will Planner is a Legacy+ guided interview that builds a plain-language planning draft for an attorney to review. It is not a will, trust, or legal advice, and it is not valid until a licensed attorney prepares and you properly execute formal documents.",
    steps: [
      "Open Will Planner from Digital Legacy (/legacy/will) when you’re on Legacy+.",
      "Accept the planning-draft disclaimer, then answer short topics (you can skip optional situation packs).",
      "Build the attorney draft, download PDF or Word, and take it to a licensed attorney in your state.",
      "Use the “Make this a real will” checklist to track attorney, signing, and storage steps — checking boxes does not make the draft valid.",
      "Optionally upload a scan of the signed original into Private Documents → Wills / Estate. The paper original remains the legal document.",
      "Keep passwords, crypto keys, and business how-to in Digital Legacy / Private Documents — never in the draft.",
    ],
    relatedRoutes: [
      { label: "Will Planner", href: "/legacy/will" },
      { label: "Digital Legacy", href: "/documents/legacy" },
      { label: "Private Documents", href: "/documents" },
    ],
    planAware: true,
    notes: [
      "Ask AI may explain what the planner is and that it is not a legal will.",
      "Ask AI may explain the “Make this a real will” checklist (attorney, witnesses, storing the original, uploading a scan). Checking boxes or uploading a scan does not make the draft valid.",
      "Ask AI must not invent custom legal clauses, statutes, or “sign here to make it official” / “Mark as legal will” language.",
      "Will drafts are owner-only. Ask AI must never quote or read another user’s draft (or anyone else’s).",
      "Drafts are never shared with family chat or the family tree.",
    ],
  },
  {
    id: "settings_profile",
    topic: "Settings, profile, and avatar",
    keywords: [
      "settings",
      "avatar",
      "profile",
      "screen name",
      "display name",
      "notifications",
      "change my avatar",
      "photo",
    ],
    summary:
      "Update your screen name, profile photo, notifications, and preferences in Settings.",
    steps: [
      "Open Settings in the sidebar.",
      "Update your display name and profile photo there (account security links out to Clerk when needed).",
      "Adjust email and in-app notification preferences on the same page.",
      "Ava can also help set a friendly screen name and avatar while you’re getting started.",
    ],
    relatedRoutes: [{ label: "Settings", href: "/settings" }],
  },
  {
    id: "theme_switching",
    topic: "Theme / appearance",
    keywords: [
      "theme",
      "appearance",
      "modern",
      "original",
      "dark",
      "look",
      "design",
    ],
    summary:
      "Choose Modern (default) or Original appearance in Settings. The change is visual only — your photos and memories stay the same.",
    steps: [
      "Open Settings.",
      "Find Appearance and switch between Modern and Original.",
      "The preference is saved for this device.",
    ],
    relatedRoutes: [{ label: "Settings", href: "/settings#appearance" }],
  },
  {
    id: "billing_upgrade",
    topic: "Plans and upgrading",
    keywords: [
      "billing",
      "upgrade",
      "plan",
      "pricing",
      "subscription",
      "family plus",
      "free plan",
    ],
    summary:
      "Plans control storage, family members, and monthly movie limits. Review or change your plan on Billing.",
    steps: [
      "Open Billing to see your current plan and usage.",
      "Compare plans and upgrade if you need more storage, members, or movies.",
      "Manage payment details from Billing when Stripe is connected.",
    ],
    relatedRoutes: [
      { label: "Billing", href: "/billing" },
      { label: "Pricing", href: "/pricing" },
    ],
    planAware: true,
  },
  {
    id: "storage_limits",
    topic: "Storage limits",
    keywords: [
      "storage",
      "space",
      "quota",
      "full",
      "limit",
      "gb",
      "too large",
      "disk",
    ],
    summary:
      "Storage counts the files you’ve uploaded. If you’re out of room, free space or upgrade your plan.",
    steps: [
      "Check storage usage on Billing or Home.",
      "Delete photos you no longer need from Photos, or upgrade for more space.",
      "Try uploading again once you have room.",
    ],
    relatedRoutes: [
      { label: "Billing", href: "/billing" },
      { label: "Photos", href: "/media" },
    ],
    planAware: true,
  },
] as const;
