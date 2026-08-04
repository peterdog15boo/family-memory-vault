import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AcceptFamilyInvite } from "@/components/family/AcceptFamilyInvite";
import { ensureAppUser } from "@/lib/users";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

/**
 * /family/accept?token=… — join a family from an invite link.
 * Unauthenticated visitors are sent to sign-in with redirect_url preserved.
 */
export default async function FamilyAcceptPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim() || null;
  const returnPath = token
    ? `/family/accept?token=${encodeURIComponent(token)}`
    : "/family/accept";

  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
  }

  await ensureAppUser(userId);

  return (
    <div className="mx-auto max-w-lg pt-4">
      <AcceptFamilyInvite token={token} />
    </div>
  );
}
