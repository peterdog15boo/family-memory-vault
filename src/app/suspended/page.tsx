import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SuspendedActions } from "@/components/admin/SuspendedActions";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const db = getDb();
  const [row] = await db
    .select({
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.suspendedAt) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Account suspended
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Access to Family Memory Vault is currently disabled for{" "}
        <span className="text-ink">{row.email}</span>.
      </p>
      {row.suspendedReason ? (
        <p className="mt-4 rounded-md border border-ink/10 bg-canvas-deep/50 px-4 py-3 text-sm text-ink">
          {row.suspendedReason}
        </p>
      ) : null}
      <p className="mt-6 text-sm text-ink-muted">
        If you believe this is a mistake, contact support.
      </p>
      <SuspendedActions />
    </div>
  );
}
