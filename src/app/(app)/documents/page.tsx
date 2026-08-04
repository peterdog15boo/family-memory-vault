import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DocumentsWorkspace } from "@/components/documents/DocumentsWorkspace";
import {
  countPrivateDocumentsByCategory,
  ensureDefaultDocumentCategories,
  listPrivateDocuments,
} from "@/lib/documents";
import type { PrivateDocumentListView } from "@/lib/documents/types";
import {
  serializeDocumentCategory,
  serializePrivateDocument,
} from "@/lib/documents/serialize";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

type DocumentsPageProps = {
  searchParams: Promise<{
    category?: string;
    q?: string;
    view?: string;
  }>;
};

const VIEWS = new Set<PrivateDocumentListView>([
  "all",
  "important",
  "recent",
  "reminders",
]);

/**
 * Private Documents — owner-only vault, isolated from family media.
 */
export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const viewRaw = params.view?.trim() ?? "all";
  const view: PrivateDocumentListView = VIEWS.has(
    viewRaw as PrivateDocumentListView,
  )
    ? (viewRaw as PrivateDocumentListView)
    : "all";

  const [categories, counts] = await Promise.all([
    ensureDefaultDocumentCategories(userId),
    countPrivateDocumentsByCategory(userId),
  ]);

  const selected =
    categories.find((c) => c.slug === params.category?.trim()) ?? null;

  const documents = await listPrivateDocuments(userId, {
    categoryId: selected?.id,
    query: query || undefined,
    view,
    limit: 100,
  });

  return (
    <DocumentsWorkspace
      categories={categories.map((c) =>
        serializeDocumentCategory(c, counts[c.id] ?? 0),
      )}
      documents={documents.map((d) => serializePrivateDocument(d))}
      selectedCategoryId={selected?.id ?? null}
      initialQuery={query}
      initialView={view}
      r2Configured={isR2Configured()}
    />
  );
}
