import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AcceptFamilyInvite } from "@/components/family/AcceptFamilyInvite";
import { ensureAppUser } from "@/lib/users";

type PageProps = {
  searchParams: Promise<{ token?: string; next?: string }>;
};

function safeNextPath(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/**
 * /family/accept?token=… — join a family from an invite link.
 * Optional `next` deep-links into upload after accept (photo requests).
 */
export default async function FamilyAcceptPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim() || null;
  const next = safeNextPath(params.next);
  const returnPath = (() => {
    const url = new URL("/family/accept", "https://local.invalid");
    if (token) url.searchParams.set("token", token);
    if (next) url.searchParams.set("next", next);
    return `${url.pathname}${url.search}`;
  })();

  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
  }

  await ensureAppUser(userId);

  return (
    <div className="mx-auto max-w-lg pt-4">
      <AcceptFamilyInvite token={token} nextPath={next} />
    </div>
  );
}
