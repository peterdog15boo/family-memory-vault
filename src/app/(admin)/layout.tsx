import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { isUserSuspended } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/admin";
import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";

export const dynamic = "force-dynamic";

/**
 * All /admin/* routes: signed-in admins only (DB is_admin or ADMIN_USER_IDS).
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await requireAdmin();
  if (await isUserSuspended(userId)) {
    redirect("/suspended");
  }
  if (await shouldRedirectToBetaNda(userId)) {
    redirect(`/beta-agree?redirect_url=${encodeURIComponent("/admin")}`);
  }

  let displayName = "Admin";
  try {
    const user = await currentUser();
    displayName =
      user?.fullName ||
      user?.firstName ||
      user?.primaryEmailAddress?.emailAddress ||
      "Admin";
  } catch {
    const { userId: sid } = await auth();
    if (sid) displayName = sid.slice(0, 12);
  }

  return <AdminShell displayName={displayName}>{children}</AdminShell>;
}
