import type { AssistantIntent } from "@/lib/assistant/types";
import { createDocumentCategory, listDocumentCategories, listPrivateDocuments, slugifyDocumentCategory, updatePrivateDocument } from "@/lib/documents";
import { serializeDocumentCategory, serializePrivateDocument } from "@/lib/documents/serialize";
import { getDigitalLegacyVault, createLegacyContact, createLegacyInstruction } from "@/lib/legacy";
import { computeLegacyProgress } from "@/lib/legacy/progress";

const PRIVATE_VAULT_ACTIONS = new Set<AssistantIntent["action"]>([
  "create_document_category",
  "file_private_document",
  "add_legacy_contact",
  "draft_legacy_business",
  "review_legacy_checklist",
]);

export function isPrivateVaultAction(
  action: AssistantIntent["action"],
): boolean {
  return PRIVATE_VAULT_ACTIONS.has(action);
}

export function buildPrivateVaultPreviewSummary(intent: AssistantIntent): string {
  switch (intent.action) {
    case "create_document_category":
      return `Create the private document category “${intent.document_category ?? "New category"}”.`;
    case "file_private_document":
      return `Move “${intent.document_title ?? "this document"}” into “${intent.document_category ?? "that category"}”.`;
    case "add_legacy_contact":
      return `Add ${intent.legacy_contact_name ?? "this contact"} to your Digital Legacy contacts${intent.legacy_contact_category ? ` as ${intent.legacy_contact_category.replace(/_/g, " ")}` : ""}.`;
    case "draft_legacy_business":
      return "Save a starter draft for business transition guidance in your Digital Legacy vault.";
    default:
      return "";
  }
}

export function buildPrivateVaultClarifyingQuestions(
  intent: AssistantIntent,
): string[] {
  switch (intent.action) {
    case "create_document_category":
      return intent.document_category
        ? []
        : ["What should I call the new private document category?"];
    case "file_private_document": {
      const questions: string[] = [];
      if (!intent.document_title) {
        questions.push(
          "Which private document should I file? Please name the document title you want me to move.",
        );
      }
      if (!intent.document_category) {
        questions.push("Which private document category should I use?");
      }
      return questions;
    }
    case "add_legacy_contact":
      return intent.legacy_contact_name
        ? []
        : ["Who would you like me to add as a Digital Legacy contact?"];
    case "draft_legacy_business":
      return [];
    default:
      return [];
  }
}

export async function executePrivateVaultIntent(
  userId: string,
  intent: AssistantIntent,
) {
  switch (intent.action) {
    case "create_document_category":
      return executeCreateDocumentCategory(userId, intent);
    case "file_private_document":
      return executeFilePrivateDocument(userId, intent);
    case "add_legacy_contact":
      return executeAddLegacyContact(userId, intent);
    case "draft_legacy_business":
      return executeDraftLegacyBusiness(userId, intent);
    case "review_legacy_checklist":
      return executeReviewLegacyChecklist(userId);
    default:
      throw new Error(`Unsupported private vault assistant action: ${intent.action}`);
  }
}

async function executeCreateDocumentCategory(
  userId: string,
  intent: AssistantIntent,
) {
  const name = intent.document_category?.trim();
  if (!name) {
    throw new Error("Category name is required.");
  }

  const categories = await listDocumentCategories(userId);
  const slug = slugifyDocumentCategory(name);
  const existing = categories.find(
    (category) =>
      category.slug === slug ||
      category.name.trim().toLowerCase() === name.toLowerCase(),
  );

  if (existing) {
    return {
      result: {
        type: "create_document_category" as const,
        categoryId: existing.id,
        name: existing.name,
        slug: existing.slug,
      },
      assistantMessage: `You already have a private document category called “${existing.name}”, so I didn’t create a duplicate.`,
      links: [{ label: "Open documents", href: "/documents" }],
    };
  }

  const created = await createDocumentCategory({
    userId,
    name,
    description: intent.document_category_description,
  });

  return {
    result: {
      type: "create_document_category" as const,
      categoryId: created.id,
      name: created.name,
      slug: created.slug,
    },
    assistantMessage:
      `I created the private document category “${created.name}”. Uploading files still happens in Private Documents, so nothing was uploaded from chat.`,
    links: [{ label: "Open documents", href: "/documents" }],
  };
}

async function executeFilePrivateDocument(
  userId: string,
  intent: AssistantIntent,
) {
  const targetCategory = intent.document_category?.trim();
  const documentTitle = intent.document_title?.trim();
  if (!targetCategory || !documentTitle) {
    throw new Error("Document title and category are required.");
  }

  const categories = await listDocumentCategories(userId);
  const category = categories.find(
    (item) =>
      item.slug === slugifyDocumentCategory(targetCategory) ||
      item.name.trim().toLowerCase() === targetCategory.toLowerCase(),
  );
  if (!category) {
    throw new Error(`I couldn’t find a private category named “${targetCategory}”.`);
  }

  const documents = await listPrivateDocuments(userId, {
    query: documentTitle,
    limit: 10,
  });
  const exact = documents.find(
    (item) =>
      item.title.trim().toLowerCase() === documentTitle.toLowerCase() ||
      item.originalFilename.trim().toLowerCase() === documentTitle.toLowerCase(),
  );
  const document = exact ?? documents[0] ?? null;
  if (!document) {
    throw new Error(
      `I couldn’t find a private document titled “${documentTitle}”. Upload it in Private Documents first, or tell me the exact title that’s already in your vault.`,
    );
  }

  const updated = await updatePrivateDocument(document.id, userId, {
    categoryId: category.id,
  });

  return {
    result: {
      type: "file_private_document" as const,
      documentId: updated.id,
      documentTitle: updated.title,
      categoryId: category.id,
      categoryName: category.name,
    },
    assistantMessage: `I filed “${updated.title}” under “${category.name}”.`,
    links: [{ label: "Open documents", href: `/documents/${updated.id}` }],
  };
}

async function executeAddLegacyContact(
  userId: string,
  intent: AssistantIntent,
) {
  const name = intent.legacy_contact_name?.trim();
  if (!name) {
    throw new Error("Contact name is required.");
  }

  const created = await createLegacyContact({
    userId,
    name,
    category:
      (intent.legacy_contact_category as
        | "attorney"
        | "insurance_agent"
        | "accountant"
        | "executor"
        | "business_partner"
        | "family"
        | "other"
        | undefined) ?? "other",
    email: intent.legacy_contact_email,
    phone: intent.legacy_contact_phone,
    relationship: intent.legacy_contact_relationship,
  });

  return {
    result: {
      type: "add_legacy_contact" as const,
      contactId: created.id,
      name: created.name,
      category: created.category,
    },
    assistantMessage: `I added ${created.name} to your Digital Legacy contacts${created.category !== "other" ? ` as ${created.category.replace(/_/g, " ")}` : ""}.`,
    links: [{ label: "Open legacy contacts", href: "/documents/legacy/contacts" }],
  };
}

async function executeDraftLegacyBusiness(
  userId: string,
  intent: AssistantIntent,
) {
  const sections = buildBusinessDraft(intent.raw_prompt);
  const created = [];
  for (const section of sections) {
    created.push(
      await createLegacyInstruction({
        userId,
        sectionType: section.sectionType,
        title: section.title,
        content: section.content,
      }),
    );
  }

  return {
    result: {
      type: "draft_legacy_business" as const,
      instructionIds: created.map((item) => item.id),
      title: created[0]?.title ?? "Business transition plan",
      sectionTypes: created.map((item) => item.sectionType),
    },
    assistantMessage:
      "I saved a starter business transition draft in your Digital Legacy section. Review it carefully and tailor any names, steps, and account references before relying on it.",
    links: [{ label: "Open business instructions", href: "/documents/legacy/business" }],
  };
}

async function executeReviewLegacyChecklist(userId: string) {
  const vault = await getDigitalLegacyVault(userId);
  const progress = computeLegacyProgress(vault);
  const missing = progress.items.filter((item) => !item.done);

  return {
    result: {
      type: "review_legacy_checklist" as const,
      completed: progress.completed,
      total: progress.total,
      missing: missing.map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
      })),
    },
    assistantMessage:
      missing.length === 0
        ? "Your Digital Legacy checklist is complete right now. You can still review it periodically as contacts, policies, or business details change."
        : `Your Digital Legacy checklist is ${progress.completed} of ${progress.total} complete. Still missing: ${missing.map((item) => item.label).join("; ")}.`,
    links: [
      { label: "Open Digital Legacy overview", href: "/documents/legacy" },
      { label: "Open Private Documents", href: "/documents" },
    ],
  };
}

export function buildBusinessDraft(rawPrompt: string) {
  const personalizedNote =
    rawPrompt.trim() && rawPrompt.trim().toLowerCase() !== "help me draft business transition instructions"
      ? `\nContext from your request: ${rawPrompt.trim()}`
      : "";

  return [
    {
      sectionType: "business_operations" as const,
      title: "Business transition plan",
      content: [
        "Start here",
        "- Identify who should take temporary operational responsibility.",
        "- List the first three people to call and how to reach them.",
        "- Note where core passwords, vendor contracts, payroll, and banking procedures are stored without placing secrets directly here.",
        "",
        "Continuity notes",
        "- Summarize the weekly tasks that keep the business running.",
        "- Record any deadlines, renewals, or payroll obligations that cannot be missed.",
        "- Point to the location of customer, vendor, employee, and compliance records.",
        personalizedNote,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      sectionType: "survivors_guidance" as const,
      title: "Guidance for customers, vendors, and employees",
      content: [
        "Suggested communication outline",
        "- Explain who should communicate the transition.",
        "- Note which customers or vendors need immediate outreach.",
        "- Describe any short-term promises that should be kept or renegotiated.",
        "- Record where handoff documents and status notes live.",
      ].join("\n"),
    },
  ];
}

export async function listPrivateVaultContext(userId: string) {
  const [categories, documents] = await Promise.all([
    listDocumentCategories(userId),
    listPrivateDocuments(userId, { limit: 50 }),
  ]);
  return {
    categories: categories.map((item) => serializeDocumentCategory(item)),
    documents: documents.map((item) => serializePrivateDocument(item)),
  };
}
