import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FirstFamilyMovieExperience } from "@/components/first-family-movie/FirstFamilyMovieExperience";
import { isUserSuspended } from "@/lib/admin/users";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";
import {
  completeFirstFamilyMovieIfMovieExists,
  getFirstFamilyMovieEligibility,
  isFirstFamilyMovieLocalPreviewRequest,
  isFirstFamilyMovieOnboardingEnabled,
  shouldEnterFirstFamilyMovie,
} from "@/lib/first-family-movie";
import { APP_HOME_PATH, FIRST_FAMILY_MOVIE_PATH } from "@/lib/routes";
import { shouldRedirectToTerms } from "@/lib/terms/gate";
import { ensureAppUser } from "@/lib/users";
import { getDb } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { serializeMovie } from "@/lib/movies/serialize";

export type FirstFamilyMoviePageParams = {
  movieId?: string;
  preview?: string;
};

async function resolveLocalPreview(
  params: FirstFamilyMoviePageParams,
  forcePreview: boolean,
): Promise<boolean> {
  if (forcePreview) {
    const headerList = await headers();
    return isFirstFamilyMovieLocalPreviewRequest({
      preview: "1",
      pathname: "/first-family-movie/preview",
      host: headerList.get("host"),
    });
  }

  const headerList = await headers();
  return isFirstFamilyMovieLocalPreviewRequest({
    preview: params.preview,
    pathname: headerList.get("x-pathname"),
    search: headerList.get("x-search") ?? undefined,
    host: headerList.get("host"),
  });
}

/**
 * Shared loader for `/first-family-movie` and `/first-family-movie/preview`.
 */
export async function renderFirstFamilyMovieRitual(options: {
  params: FirstFamilyMoviePageParams;
  /** Dedicated `/preview` route — force bypass when local. */
  forcePreview?: boolean;
}) {
  if (!isFirstFamilyMovieOnboardingEnabled()) {
    console.warn(
      "[first-family-movie] flag off — set FIRST_FAMILY_MOVIE_ONBOARDING=true (or NEXT_PUBLIC_*) on the host and redeploy",
    );
    redirect(APP_HOME_PATH);
  }

  const forcePreview = options.forcePreview === true;
  const localPreview = await resolveLocalPreview(options.params, forcePreview);

  // forcePreview on a non-local host must not open the ritual.
  if (forcePreview && !localPreview) {
    redirect(APP_HOME_PATH);
  }

  const ritualPath = localPreview
    ? `${FIRST_FAMILY_MOVIE_PATH}/preview`
    : FIRST_FAMILY_MOVIE_PATH;

  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(ritualPath)}`,
    );
  }

  if (await isUserSuspended(userId)) {
    redirect("/suspended");
  }

  try {
    await ensureAppUser(userId);
  } catch (error) {
    console.warn("[first-family-movie] ensureAppUser failed", error);
  }

  if (await shouldRedirectToBetaNda(userId)) {
    redirect(
      `/beta-agree?redirect_url=${encodeURIComponent(ritualPath)}`,
    );
  }

  if (await shouldRedirectToTerms(userId)) {
    redirect(
      `/terms-agree?redirect_url=${encodeURIComponent(ritualPath)}`,
    );
  }

  const eligibility = await getFirstFamilyMovieEligibility(userId);

  if (!localPreview) {
    if (await completeFirstFamilyMovieIfMovieExists(userId)) {
      console.info(
        "[first-family-movie] redirect home: auto-complete (existing movies)",
      );
      redirect(APP_HOME_PATH);
    }

    if (!(await shouldEnterFirstFamilyMovie(userId))) {
      console.info(
        "[first-family-movie] redirect home: not eligible — open /first-family-movie/preview locally",
      );
      redirect(APP_HOME_PATH);
    }
  } else {
    console.info("[first-family-movie] local preview — eligibility bypassed");
  }

  let resumeMovie = null;
  const resumeId = localPreview
    ? typeof options.params.movieId === "string" &&
      options.params.movieId.trim()
      ? options.params.movieId.trim()
      : null
    : (typeof options.params.movieId === "string" &&
        options.params.movieId.trim()) ||
      eligibility.pendingRevealMovieId;

  if (resumeId) {
    try {
      const db = getDb();
      const [row] = await db
        .select()
        .from(movies)
        .where(and(eq(movies.id, resumeId), eq(movies.userId, userId)))
        .limit(1);
      if (
        row &&
        (row.status === "ready" ||
          row.status === "processing" ||
          row.status === "queued")
      ) {
        resumeMovie = await serializeMovie(row, { includeUrls: true });
      }
    } catch (error) {
      console.warn("[first-family-movie] resume movie load failed", error);
    }
  }

  let storageBlocked = false;
  let planName = "your";
  try {
    const usage = await getAccountUsageSummary(userId);
    storageBlocked = usage.storageMeter.level === "critical";
    planName = usage.planName;
  } catch (error) {
    console.warn("[first-family-movie] usage summary failed", error);
  }

  return (
    <FirstFamilyMovieExperience
      storageBlocked={storageBlocked}
      planName={planName}
      resumeMovie={resumeMovie}
      localPreview={localPreview}
    />
  );
}
