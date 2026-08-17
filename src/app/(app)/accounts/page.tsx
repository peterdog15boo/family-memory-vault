import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ConnectedAccountsWorkspace } from "@/components/accounts/ConnectedAccountsWorkspace";
import { listConnectedAccountsForUser } from "@/lib/plaid/service";
import { ensureAppUser } from "@/lib/users";

/**
 * Connected Accounts — owner-only private vault (Plaid).
 * Isolated from Photos, Memories, and family gallery surfaces.
 */
export default async function AccountsPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  const initial = await listConnectedAccountsForUser(userId);

  return <ConnectedAccountsWorkspace initial={initial} />;
}
