import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { isUserSuspended } from "@/lib/admin/users";
import { getAvaProgress } from "@/lib/ava";
import { isAdmin } from "@/lib/auth/admin";
import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";
import { shouldRedirectToTerms } from "@/lib/terms/gate";
import { getUnreadCount } from "@/lib/notifications";
import type { AvaProgress } from "@/lib/ava/types";
import { ensureAppUser } from "@/lib/users";

/**
 * Resolve a display name without hard-failing the whole app shell.
 * `currentUser()` can throw (Clerk API / TLS / rate limits) during
 * re-renders after mutations — fall back gracefully.
 */
async function resolveShellUser(userId: string | null | undefined) {
  try {
    const user = await currentUser();
    if (user) {
      return {
        displayName:
          user.fullName ||
          user.firstName ||
          user.username ||
          user.primaryEmailAddress?.emailAddress ||
          "Family member",
        email: user.primaryEmailAddress?.emailAddress ?? null,
      };
    }
  } catch (error) {
    console.warn("[app.layout] currentUser() failed — using fallbacks", error);
  }

  // Prefer JWT/session claims when the Clerk Backend API is unavailable.
  try {
    const { sessionClaims } = await auth();
    const claims = sessionClaims as
      | {
          first_name?: string;
          last_name?: string;
          full_name?: string;
          username?: string;
          email?: string;
          primary_email_address?: string;
        }
      | null
      | undefined;

    const fromClaims =
      claims?.full_name ||
      [claims?.first_name, claims?.last_name].filter(Boolean).join(" ") ||
      claims?.username ||
      claims?.primary_email_address ||
      claims?.email;

    if (fromClaims) {
      return {
        displayName: fromClaims,
        email: claims?.primary_email_address ?? claims?.email ?? null,
      };
    }
  } catch {
    // ignore — absolute last resort below
  }

  void userId;
  return {
    displayName: "Family member",
    email: null as string | null,
  };
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  if (userId && (await isUserSuspended(userId))) {
    redirect("/suspended");
  }

  // Ensure DB user + Ava eligibility exist before progress / shell render.
  if (userId) {
    try {
      await ensureAppUser(userId);
    } catch (error) {
      console.warn("[app.layout] ensureAppUser failed", error);
    }
  }

  if (userId && (await shouldRedirectToBetaNda(userId))) {
    const hdrs = await headers();
    const path = hdrs.get("x-pathname")?.trim() || "/dashboard";
    const safe =
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !path.startsWith("/beta-agree") &&
      !path.startsWith("/terms-agree")
        ? path
        : "/dashboard";
    redirect(`/beta-agree?redirect_url=${encodeURIComponent(safe)}`);
  }

  if (userId && (await shouldRedirectToTerms(userId))) {
    const hdrs = await headers();
    const path = hdrs.get("x-pathname")?.trim() || "/dashboard";
    const safe =
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !path.startsWith("/terms-agree") &&
      !path.startsWith("/beta-agree")
        ? path
        : "/dashboard";
    redirect(`/terms-agree?redirect_url=${encodeURIComponent(safe)}`);
  }

  const [{ displayName, email }, unreadCount, admin, avaProgress] =
    await Promise.all([
      resolveShellUser(userId),
      safeUnreadCount(userId),
      isAdmin(userId),
      safeAvaProgress(userId),
    ]);

  return (
    <DashboardShell
      displayName={displayName}
      email={email}
      isAdmin={admin}
      initialUnreadCount={unreadCount}
      initialAvaProgress={avaProgress}
    >
      {children}
    </DashboardShell>
  );
}

async function safeUnreadCount(
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) return 0;
  try {
    return await getUnreadCount(userId);
  } catch {
    return 0;
  }
}

async function safeAvaProgress(
  userId: string | null | undefined,
): Promise<AvaProgress | null> {
  if (!userId) return null;
  try {
    return await getAvaProgress(userId);
  } catch (error) {
    console.warn("[app.layout] getAvaProgress failed", error);
    return null;
  }
}
