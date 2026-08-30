/**
 * Client-safe navigation and section config for Digital Legacy.
 */

import type { LegacyInstructionSectionType } from "@/lib/legacy/types";

export type LegacyNavItem = {
  href: string;
  label: string;
  description: string;
};

export const LEGACY_NAV: LegacyNavItem[] = [
  {
    href: "/documents/legacy",
    label: "Overview",
    description: "Your progress and a gentle guide to this space",
  },
  {
    href: "/legacy/will",
    label: "Will planner",
    description: "Guided interview that builds an attorney planning draft",
  },
  {
    href: "/legacy/trust",
    label: "Living trust planner",
    description: "Plan a revocable trust outline and funding notes for counsel",
  },
  {
    href: "/documents/legacy/message",
    label: "Message to Loved Ones",
    description: "A personal letter and wishes for those you care about",
  },
  {
    href: "/documents/legacy/contacts",
    label: "Key Contacts",
    description: "People who can help when guidance is needed",
  },
    {
      href: "/documents/legacy/business",
      label: "Business Continuity",
      description: "Walkthrough videos and notes for running or transitioning your work",
    },
    {
      href: "/documents/legacy/practical",
      label: "Practical Instructions",
      description: "Home, finances, insurance, and everyday details",
    },
    {
      href: "/documents/legacy/accounts",
      label: "Financial Accounts",
      description: "Banking, investments, loans, and cards linked with Plaid",
    },
    {
      href: "/documents/legacy/secure",
      label: "Secure Items",
      description: "Sensitive access notes — handle with extra care",
    },
  {
    href: "/documents/legacy/emergency",
    label: "Emergency Access",
    description: "Trusted contacts who may request break-glass access",
  },
];

export type LegacyInstructionHint = {
  sectionType: LegacyInstructionSectionType;
  title: string;
  description: string;
  placeholder: string;
  defaultBlockTitle: string;
  starterBlocks?: Array<{
    title: string;
    content: string;
  }>;
};

export type LegacyVideoStarter = {
  title: string;
  /** Gentle prompt for the optional written summary under the video. */
  summaryHint?: string;
};

/** Suggested walkthrough titles for Business Continuity videos. */
export const LEGACY_BUSINESS_VIDEO_STARTERS: Partial<
  Record<LegacyInstructionSectionType, LegacyVideoStarter[]>
> = {
  business_operations: [
    {
      title: "Start Here",
      summaryHint:
        "What to watch first, and how the rest of this guide is organized.",
    },
    {
      title: "Systems Access",
      summaryHint:
        "How to reach the tools, dashboards, and accounts that keep work moving.",
    },
    {
      title: "People to Call",
      summaryHint:
        "Who to contact in the first 48 hours — and why each person matters.",
    },
    {
      title: "Day-to-day operations",
      summaryHint:
        "How the work typically runs, and what should continue without interruption.",
    },
  ],
  survivors_guidance: [
    {
      title: "Customer Communication",
      summaryHint:
        "How outreach should sound, who to contact first, and what to say.",
    },
    {
      title: "Vendors & partners",
      summaryHint: "Who to notify and what commitments or deadlines to honor.",
    },
    {
      title: "Team update",
      summaryHint: "Guidance for employees, contractors, or close collaborators.",
    },
  ],
};

export const LEGACY_BUSINESS_HINTS: LegacyInstructionHint[] = [
  {
    sectionType: "business_operations",
    title: "Running or transitioning the business",
    description:
      "Who to call first, where critical operational information lives, and how day-to-day work should continue or wind down. Short videos work especially well here — a “Start Here” walkthrough, systems access, and who to call in the first 48 hours.",
    placeholder:
      "Example: Call Alex (operations) first. Daily schedules live in… Critical vendor contacts are…",
    defaultBlockTitle: "Business operations",
    starterBlocks: [
      {
        title: "Day-one instructions",
        content:
          "First calls to make:\n- \n- \n-\n\nImmediate tasks that cannot wait:\n- \n- \n-\n\nWhere the next person should begin:\n- ",
      },
      {
        title: "Critical systems list",
        content:
          "Systems to keep running:\n- Finance / payroll:\n- Customer records / CRM:\n- Email / communications:\n- Website / domains:\n- Operations / scheduling:\n\nWhere setup notes or support contacts live:\n- ",
      },
    ],
  },
  {
    sectionType: "survivors_guidance",
    title: "Guidance for customers, vendors, and employees",
    description:
      "High-level messages or next steps for the people connected to your work — in writing, or as a short video about how customer communication should be handled.",
    placeholder:
      "Example: Please notify active clients within one week. Payroll runs through…",
    defaultBlockTitle: "Guidance for survivors",
    starterBlocks: [
      {
        title: "Customer communication guidance",
        content:
          "Suggested communication order:\n- Customers who need immediate outreach:\n- Vendors or partners to notify:\n- Employees or contractors to update:\n\nTone to use:\n- \n\nPromises, deadlines, or commitments to mention:\n- ",
      },
    ],
  },
];

export const LEGACY_PRACTICAL_HINTS: LegacyInstructionHint[] = [
  {
    sectionType: "personal",
    title: "Home & personal matters",
    description:
      "Where important physical documents are kept, keys, pets, property, and other home details.",
    placeholder:
      "Example: Original will is in the safe behind the painting. Spare house keys are with…",
    defaultBlockTitle: "Home & personal",
    starterBlocks: [
      {
        title: "Where things are checklist",
        content:
          "Important physical items and where to find them:\n- Home safe:\n- Safety deposit box:\n- Filing cabinet:\n- Fireproof box:\n- Password manager / emergency access instructions:\n- Spare keys:\n- Original estate documents:\n- Titles / deeds / vehicle paperwork:\n- Sentimental items or family records:\n- ",
      },
    ],
  },
  {
    sectionType: "financial",
    title: "Finances, insurance & recurring bills",
    description:
      "Accounts, policies, subscriptions, and bills someone may need to manage or cancel.",
    placeholder:
      "Example: Mortgage is with… Home insurance renews in March. Cancel streaming services after…",
    defaultBlockTitle: "Finances & insurance",
  },
  {
    sectionType: "accounts_access",
    title: "Accounts & access",
    description:
      "Where to find login guidance — detailed passwords belong in Secure Items.",
    placeholder:
      "Example: Email is through Google. Banking app is on my phone. See Secure Items for credentials.",
    defaultBlockTitle: "Accounts & access",
  },
  {
    sectionType: "legal",
    title: "Legal & estate matters",
    description:
      "Attorney contacts, trust or will locations, and other legal steps already in place.",
    placeholder:
      "Example: Estate attorney is… Trust documents are filed with…",
    defaultBlockTitle: "Legal & estate",
  },
];
