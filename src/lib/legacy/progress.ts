/**
 * Progress checklist for the Digital Legacy overview.
 */

import type {
  LegacyContact,
  LegacyInstruction,
  LegacyProfile,
  LegacySecureItem,
  LegacyVideo,
} from "@/lib/db/schema";
import type { LegacyProgress, LegacyProgressItem } from "@/lib/legacy/serialize";

const BUSINESS_SECTIONS = new Set([
  "business_operations",
  "survivors_guidance",
]);

const PRACTICAL_SECTIONS = new Set([
  "personal",
  "financial",
  "accounts_access",
  "legal",
]);

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function computeLegacyProgress(input: {
  profile: LegacyProfile;
  contacts: LegacyContact[];
  instructions: LegacyInstruction[];
  secureItems: LegacySecureItem[];
  videos?: Pick<LegacyVideo, "sectionType">[];
}): LegacyProgress {
  const { profile, contacts, instructions, secureItems, videos = [] } = input;

  const hasMessageVideo = videos.some(
    (video) => video.sectionType === "message_to_loved_ones",
  );
  const messageDone =
    hasText(profile.summaryMessage) ||
    hasText(profile.generalInstructions) ||
    hasMessageVideo;

  const contactsDone = contacts.length > 0;
  const primaryDone = contacts.some((c) => c.isPrimary);

  const businessDone = instructions.some((i) =>
    BUSINESS_SECTIONS.has(i.sectionType),
  );

  const practicalDone = instructions.some((i) =>
    PRACTICAL_SECTIONS.has(i.sectionType),
  );

  const secureDone = secureItems.length > 0;

  const documentsLinked = secureItems.some((s) => s.relatedDocumentId);

  const items: LegacyProgressItem[] = [
    {
      id: "message",
      label: "A message for loved ones",
      done: messageDone,
      href: "/documents/legacy/message",
    },
    {
      id: "contacts",
      label: "Key contacts who can help",
      done: contactsDone,
      href: "/documents/legacy/contacts",
    },
    {
      id: "primary",
      label: "A primary contact identified",
      done: primaryDone,
      href: "/documents/legacy/contacts",
    },
    {
      id: "business",
      label: "Business continuity guidance",
      done: businessDone,
      href: "/documents/legacy/business",
    },
    {
      id: "practical",
      label: "Practical home & finance instructions",
      done: practicalDone,
      href: "/documents/legacy/practical",
    },
    {
      id: "secure",
      label: "Secure account & access notes",
      done: secureDone,
      href: "/documents/legacy/secure",
    },
    {
      id: "documents",
      label: "Private documents linked to secure items",
      done: documentsLinked,
      href: "/documents/legacy/secure",
    },
  ];

  const completed = items.filter((i) => i.done).length;

  return {
    completed,
    total: items.length,
    items,
  };
}
