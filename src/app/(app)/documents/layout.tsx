import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

/**
 * Gates Private Documents + Digital Legacy routes behind Legacy+.
 */
export default async function DocumentsSectionLayout({
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
      <LegacyPlusLockedPage
        featureLabel="Private Documents & Digital Legacy"
        gate={gate}
      />
    );
  }

  return children;
}
