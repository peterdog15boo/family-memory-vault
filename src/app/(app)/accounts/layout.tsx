import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

/**
 * Gates Connected Accounts behind Legacy+.
 */
export default async function AccountsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  const gate = await canUseLegacyPlusFeatures(userId);
  if (!gate.allowed) {
    return (
      <LegacyPlusLockedPage featureLabel="Connected Accounts" gate={gate} />
    );
  }

  return children;
}
