import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { isUserSuspended } from "@/lib/admin/users";
import { getAvaProgress } from "@/lib/ava";
import { isAdmin } from "@/lib/auth/admin";
import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";
import { shouldEnterFirstFamilyMovie } from "@/lib/first-family-movie";
import { shouldRedirectToTerms } from "@/lib/terms/gate";
import { getUnreadCount } from "@/lib/notifications";
import type { AvaProgress } from "@/lib/ava/types";
import { getIdleTimeoutPolicyForUser } from "@/lib/account-preferences";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { APP_HOME_PATH, FIRST_FAMILY_MOVIE_PATH } from "@/lib/routes";
import { ensureAppUser } from "@/lib/users";

/** Prefer the first-movie ritual after NDA/Terms when the vault is eligible. */
async function postAgreeDestination(
  userId: string,
  pathFromRequest: string,
): Promise<string> {
  const safe =
    pathFromRequest.startsWith("/") &&
    !pathFromRequest.startsWith("//") &&
    !pathFromRequest.startsWith("/beta-agree") &&
    !pathFromRequest.startsWith("/terms-agree")
      ? pathFromRequest
      : APP_HOME_PATH;

  // Deep links (invite accept, settings, …) win over the welcome ritual.
  if (safe !== APP_HOME_PATH && safe !== "/") {
    return safe;
  }

  try {
    if (await shouldEnterFirstFamilyMovie(userId)) {
      return FIRST_FAMILY_MOVIE_PATH;
    }
  } catch (error) {
    console.warn("[app.layout] first-family-movie gate failed", error);
  }
  return safe === "/" ? APP_HOME_PATH : safe;
}

/**
 * User-specific shell (auth, unread badge, Ava). Must not serve a cached
 * layout RSC after mark-read — that resurrects the header badge when
 * returning from Admin (separate route group remounts this layout).
 */
export const dynamic = "force-dynamic";

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
    const path = hdrs.get("x-pathname")?.trim() || APP_HOME_PATH;
    const next = await postAgreeDestination(userId, path);
    redirect(`/beta-agree?redirect_url=${encodeURIComponent(next)}`);
  }

  if (userId && (await shouldRedirectToTerms(userId))) {
    const hdrs = await headers();
    const path = hdrs.get("x-pathname")?.trim() || APP_HOME_PATH;
    const next = await postAgreeDestination(userId, path);
    redirect(`/terms-agree?redirect_url=${encodeURIComponent(next)}`);
  }

  const [
    { displayName, email },
    unreadCount,
    admin,
    avaProgress,
    idleTimeoutPolicy,
    showLegacyPlusNav,
  ] = await Promise.all([
    resolveShellUser(userId),
    safeUnreadCount(userId),
    isAdmin(userId),
    safeAvaProgress(userId),
    safeIdleTimeoutPolicy(userId),
    safeShowLegacyPlusNav(userId),
  ]);

  return (
    <DashboardShell
      displayName={displayName}
      email={email}
      isAdmin={admin}
      initialUnreadCount={unreadCount}
      initialAvaProgress={avaProgress}
      idleTimeoutPolicy={idleTimeoutPolicy}
      showLegacyPlusNav={showLegacyPlusNav}
    >
      {children}
    </DashboardShell>
  );
}

async function safeShowLegacyPlusNav(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const gate = await canUseLegacyPlusFeatures(userId);
    return gate.allowed;
  } catch (error) {
    console.warn("[app.layout] canUseLegacyPlusFeatures failed", error);
    return false;
  }
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

async function safeIdleTimeoutPolicy(userId: string | null | undefined) {
  if (!userId) {
    return {
      enabled: true,
      preferenceEnabled: true,
      canDisable: false,
      planSlug: "free",
    };
  }
  try {
    return await getIdleTimeoutPolicyForUser(userId);
  } catch (error) {
    console.warn("[app.layout] getIdleTimeoutPolicyForUser failed", error);
    return {
      enabled: true,
      preferenceEnabled: true,
      canDisable: false,
      planSlug: "free",
    };
  }
}
