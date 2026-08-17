import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyFinancialAccountsPanel } from "@/components/legacy/LegacyFinancialAccountsPanel";
import { LegacyShell } from "@/components/legacy/LegacyShell";
import { listConnectedAccountsForUser } from "@/lib/plaid/service";
import { ensureAppUser } from "@/lib/users";

/**
 * Digital Legacy — Financial Accounts (Plaid-linked, owner-only).
 * Grouped by the same categories as /accounts.
 */
export default async function LegacyFinancialAccountsPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const initial = await listConnectedAccountsForUser(userId);

  return (
    <LegacyShell>
      <LegacyFinancialAccountsPanel initial={initial} />
    </LegacyShell>
  );
}
