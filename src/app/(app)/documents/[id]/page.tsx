import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { DocumentDetailView } from "@/components/documents/DocumentDetailView";
import {
  ensureDefaultDocumentCategories,
  getPrivateDocumentWithCategory,
} from "@/lib/documents";
import {
  serializeDocumentCategory,
  serializePrivateDocument,
} from "@/lib/documents/serialize";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

type DocumentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentDetailPage({
  params,
}: DocumentDetailPageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  const { id } = await params;

  const [row, categories] = await Promise.all([
    getPrivateDocumentWithCategory(id, userId),
    ensureDefaultDocumentCategories(userId),
  ]);

  if (!row) notFound();

  return (
    <DocumentDetailView
      document={serializePrivateDocument(row, row.category)}
      categories={categories.map((c) => serializeDocumentCategory(c))}
      r2Configured={isR2Configured()}
    />
  );
}
