/**
 * Canonical Family Memory Vault Terms of Service (v1.0).
 * Single source of truth for /terms, /terms-agree, and future legal links.
 * Keep in sync with TERMS_VERSION in @/lib/terms/constants when updating.
 */

export type TermsSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  afterBullets?: string[];
  /** Nested subsections (e.g. 4.1 Ownership). */
  subsections?: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
    afterBullets?: string[];
  }>;
};

/** Display version string stored on acceptance rows. */
export const TERMS_OF_SERVICE_VERSION = "v1.0 - August 2026";

export const TERMS_OF_SERVICE_TITLE = "Family Memory Vault — Terms of Service";

export const TERMS_OF_SERVICE_META = {
  lastUpdated: "August 11, 2026",
  versionLabel: "1.0",
} as const;

export const TERMS_OF_SERVICE_INTRO: string[] = [
  "These Terms of Service (“Terms”) are a legal agreement between you (“you,” “user,” or “Tester”) and the operator of Family Memory Vault (“Company,” “we,” “us,” or “our”).",
  "By accessing or using Family Memory Vault (the “Service”), including during any beta period, you agree to these Terms. If you do not agree, do not use the Service.",
];

export const TERMS_OF_SERVICE_SECTIONS: TermsSection[] = [
  {
    heading: "1. The Service",
    paragraphs: [
      "Family Memory Vault is a software platform that may allow users to:",
    ],
    bullets: [
      "upload, store, organize, and view photos and videos",
      "create albums/memories and slideshow/movies",
      "use AI-assisted search, organization, captions, face grouping, and related tools",
      "invite family members and share selected content",
      "store private documents and digital-legacy information",
      "order optional physical-media digitizing services such as the Family Memory Box",
      "receive notifications, support communications, and product updates",
    ],
    afterBullets: [
      "Features may change, be added, limited, suspended, or discontinued at any time.",
    ],
  },
  {
    heading: "2. Eligibility and Accounts",
    paragraphs: [
      "You must be at least 18 years old, or the age of legal majority in your jurisdiction, to create an account and accept these Terms.",
      "You agree to:",
    ],
    bullets: [
      "provide accurate account information",
      "keep your login credentials confidential",
      "remain responsible for activity under your account",
      "notify us promptly of unauthorized access",
    ],
    afterBullets: [
      "We may refuse, suspend, or terminate access if we believe you violated these Terms, created risk, or misused the Service.",
    ],
  },
  {
    heading: "3. Beta Access",
    paragraphs: ["If you are using a beta, pre-release, or test version of the Service:"],
    bullets: [
      "the Service is provided for evaluation and feedback",
      "features may be incomplete, unstable, or inaccurate",
      "data loss, delays, failed renders, and interruptions may occur",
      "beta confidentiality obligations may also apply under a separate Beta Tester NDA",
      "if both the Beta NDA and these Terms apply, both are binding; for confidentiality of the beta itself, the Beta NDA controls",
    ],
    afterBullets: ["Beta access may be revoked at any time."],
  },
  {
    heading: "4. Your Content",
    paragraphs: [
      "“Your Content” means photos, videos, documents, text, audio, legacy information, feedback, and any other materials you upload, submit, or create through the Service.",
    ],
    subsections: [
      {
        heading: "4.1 Ownership",
        paragraphs: ["You retain ownership of Your Content."],
      },
      {
        heading: "4.2 License to operate the Service",
        paragraphs: [
          "You grant Company a limited, worldwide, non-exclusive license to host, store, process, transmit, display, analyze, back up, and otherwise use Your Content only as needed to:",
        ],
        bullets: [
          "provide and maintain the Service",
          "perform security scanning and safety moderation",
          "generate requested outputs such as thumbnails, movies, transcripts, tags, or search indexes",
          "enable sharing features you choose",
          "provide support and prevent abuse",
          "comply with law",
        ],
        afterBullets: [
          "This license ends when Your Content is deleted from active systems, except for residual copies in routine backups that are overwritten or deleted in the ordinary course, and except where retention is required by law or legitimate dispute/security needs.",
        ],
      },
      {
        heading: "4.3 Your responsibilities",
        paragraphs: [
          "You are solely responsible for Your Content and represent that:",
        ],
        bullets: [
          "you own it or have all rights needed to upload and use it in the Service",
          "it does not violate law or third-party rights",
          "it does not contain child sexual abuse material or other prohibited content",
          "you will not upload content you are not authorized to share",
        ],
        afterBullets: [
          "You should avoid uploading irreplaceable originals as your only copy.",
        ],
      },
    ],
  },
  {
    heading: "5. Prohibited Content and Conduct",
    paragraphs: ["You may not use the Service to:"],
    bullets: [
      "upload or distribute illegal content",
      "upload child sexual abuse material, or exploit or endanger minors",
      "harass, threaten, defame, or harm others",
      "upload malware or attempt to disrupt the Service",
      "attempt unauthorized access to systems, accounts, or data",
      "reverse engineer, scrape, or misuse the Service except where prohibited restrictions are disallowed by law",
      "use the Service to build a competing product through unauthorized means",
      "share account access in violation of these Terms or any beta rules",
      "bypass safety, moderation, billing, or access controls",
    ],
    afterBullets: [
      "We may remove content, restrict features, suspend accounts, and report illegal material to authorities or authorized reporting bodies when appropriate.",
    ],
  },
  {
    heading: "6. Safety Scanning, Moderation, and AI Features",
    subsections: [
      {
        heading: "6.1 Safety scanning",
        paragraphs: [
          "Uploaded media may be automatically scanned for security, abuse, malware indicators, and prohibited content. Some content may be quarantined, rejected, delayed, or made available only after review.",
        ],
      },
      {
        heading: "6.2 AI features",
        paragraphs: [
          "The Service may use automated systems for:",
        ],
        bullets: [
          "object/scene labeling",
          "face detection/grouping",
          "search and retrieval",
          "captions or descriptions",
          "assistant responses",
          "movie/slideshow generation support",
        ],
        afterBullets: [
          "AI outputs may be incomplete, incorrect, biased, or misleading. AI is an aid, not a guarantee of accuracy.",
        ],
      },
      {
        heading: "6.3 Face and biometric-related processing",
        paragraphs: [
          "If face detection or similar features are enabled, they are provided to help organize personal family media. You are responsible for ensuring you have the right to upload images of people and to use organization features in your jurisdiction.",
        ],
      },
    ],
  },
  {
    heading: "7. Family Sharing and Permissions",
    paragraphs: ["If you invite others or enable sharing:"],
    bullets: [
      "you control what you share only to the extent the feature settings allow",
      "people you invite may be able to view or interact with shared content according to permissions",
      "you should invite only people you trust",
      "you are responsible for invitations you send and access you grant",
    ],
    afterBullets: [
      "We are not responsible for actions taken by people you invite or designate.",
    ],
  },
  {
    heading: "8. Private Documents and Digital Legacy",
    paragraphs: [
      "Private Documents, Digital Legacy, emergency contacts, and related features are tools to help you organize information. They are not:",
    ],
    bullets: [
      "legal advice",
      "estate-planning services",
      "a substitute for wills, trusts, powers of attorney, or professional counsel",
      "a guarantee that designated people will receive or act on information",
    ],
    afterBullets: [
      "Emergency or permanent access features depend on correct setup, account status, and product availability. You should maintain independent legal and family arrangements.",
    ],
  },
  {
    heading: "9. Family Memory Box and Digitizing Services",
    paragraphs: ["If you order physical digitizing services:"],
    bullets: [
      "timelines are estimates, not guarantees",
      "item counts you provide are estimates",
      "some media may be damaged, incomplete, unreadable, or non-digitizable",
      "risk of loss or damage in shipping depends on carrier handling and packaging; we are not liable for carrier failures beyond any specific written commitment we make at purchase",
      "digitized outputs are delivered through the Service when processing completes",
      "pricing, scope, and turnaround may change unless locked in an order confirmation",
    ],
    afterBullets: ["Additional order terms may apply at checkout."],
  },
  {
    heading: "10. Movies, Exports, and Third-Party Sharing",
    paragraphs: [
      "Movies, slideshows, downloads, and share links are provided as-is.",
      "You are responsible for:",
    ],
    bullets: [
      "how you share exported files",
      "rights to any music, images, or materials included",
      "compliance with third-party platform rules when posting externally",
    ],
    afterBullets: [
      "Share links may expire or be revoked. Do not rely on temporary links as permanent archives.",
    ],
  },
  {
    heading: "11. Subscriptions, Trials, and Fees",
    paragraphs: [
      "Some features may require paid plans, usage limits, or one-time fees.",
      "If paid offerings apply:",
    ],
    bullets: [
      "fees, taxes, renewals, and cancellation terms will be presented at purchase",
      "unless required by law, payments are non-refundable once processed",
      "failure to pay may result in suspension or feature limitation",
      "plan limits such as storage or monthly movie quotas may apply",
    ],
    afterBullets: [
      "We may change pricing prospectively with notice where required.",
    ],
  },
  {
    heading: "12. Privacy and Data Security",
    paragraphs: [
      "Our handling of personal data is described in our Privacy Policy, if published, and related in-product disclosures.",
      "We use administrative, technical, and organizational safeguards designed to protect the Service. No method of transmission or storage is 100% secure. You use the Service understanding residual risk remains.",
      "You are responsible for maintaining your own backups of important content.",
    ],
  },
  {
    heading: "13. Intellectual Property",
    paragraphs: [
      "The Service, including software, design, branding, interfaces, documentation, and non-user content, is owned by Company or its licensors.",
      "Except for the limited right to use the Service as permitted, no rights are granted to you under Company’s intellectual property.",
      "Feedback you provide may be used by Company freely to improve the Service without obligation to you.",
    ],
  },
  {
    heading: "14. Third-Party Services",
    paragraphs: [
      "The Service may rely on third parties such as authentication providers, cloud storage, email delivery, payment processors, AI providers, and infrastructure vendors.",
      "We are not responsible for third-party outages, policy changes, or failures beyond our reasonable control.",
    ],
  },
  {
    heading: "15. Disclaimers",
    paragraphs: [
      "THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.”",
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, COMPANY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY OF AI OUTPUTS.",
      "We do not warrant that:",
    ],
    bullets: [
      "the Service will be uninterrupted or error-free",
      "content will never be lost or delayed",
      "AI results will be accurate",
      "security will be absolute",
      "digitizing results will meet subjective expectations",
    ],
  },
  {
    heading: "16. Limitation of Liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW:",
    ],
    bullets: [
      "Company is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages",
      "Company is not liable for lost profits, lost data, business interruption, or substitute service costs",
      "Company’s total liability for any claim relating to the Service will not exceed the greater of: (a) amounts you paid to Company for the Service in the 12 months before the claim, or (b) USD $100 if you have paid nothing",
    ],
    afterBullets: [
      "Some jurisdictions do not allow certain limitations; in those cases, limits apply to the fullest extent permitted.",
    ],
  },
  {
    heading: "17. Indemnification",
    paragraphs: [
      "You agree to defend, indemnify, and hold harmless Company and its officers, directors, employees, contractors, and agents from claims arising out of:",
    ],
    bullets: [
      "Your Content",
      "your use of the Service",
      "your invitations/sharing choices",
      "your violation of these Terms",
      "your violation of law or third-party rights",
    ],
  },
  {
    heading: "18. Suspension, Termination, and Deletion",
    paragraphs: [
      "You may stop using the Service at any time.",
      "We may suspend or terminate access for violations, risk, legal compliance, nonpayment, or product discontinuation.",
      "Upon termination:",
    ],
    bullets: [
      "your right to use the Service ends",
      "we may delete or disable access to Your Content according to product workflows and legal obligations",
      "sections that should survive termination do survive, including ownership, disclaimers, liability limits, indemnity, and governing law",
    ],
  },
  {
    heading: "19. Changes to the Service or Terms",
    paragraphs: [
      "We may update the Service and these Terms.",
      "If changes are material, we may provide notice in-app or by other reasonable means. Continued use after the effective date constitutes acceptance, except where law requires a different method.",
    ],
  },
  {
    heading: "20. Governing Law and Disputes",
    paragraphs: [
      "These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law principles.",
      "Exclusive venue for disputes shall be the state or federal courts located in Texas, unless applicable law requires otherwise.",
    ],
  },
  {
    heading: "21. General",
    bullets: [
      "These Terms are the entire agreement regarding the Service, except for any separate Beta NDA, privacy policy, or order-specific terms",
      "If any provision is unenforceable, the rest remains in effect",
      "Failure to enforce a provision is not a waiver",
      "You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or corporate reorganization",
      "Headings are for convenience only",
    ],
  },
  {
    heading: "22. Contact",
    paragraphs: [
      "For questions about these Terms, contact the operator of Family Memory Vault through the support or contact channels published in the Service.",
    ],
  },
];

export const TERMS_OF_SERVICE_CLOSING =
  "By checking the acceptance box and continuing, you acknowledge that you have read, understood, and agree to these Terms of Service.";
