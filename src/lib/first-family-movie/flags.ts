/**
 * Public feature flag for the “Your First Family Movie” first-session ritual.
 * Set NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING=true to enable.
 */

function isTruthyFlag(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isFirstFamilyMovieOnboardingEnabled(): boolean {
  return isTruthyFlag(
    process.env.NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING,
  );
}

/**
 * Local-only ritual preview. Active in `next dev`, or when the request is
 * clearly localhost (covers odd NODE_ENV edge cases on Windows).
 */
export function isFirstFamilyMovieLocalPreviewEnabled(
  host?: string | null,
): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const h = (host ?? "").toLowerCase();
  return (
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1") ||
    h.startsWith("[::1]")
  );
}

/**
 * True when preview is requested and we are on a local/dev host.
 * Accepts `?preview=1` / true / yes / on, or a `/preview` path segment.
 */
export function isFirstFamilyMovieLocalPreviewRequest(input: {
  preview?: string | string[] | null;
  pathname?: string | null;
  search?: string | null;
  host?: string | null;
}): boolean {
  if (!isFirstFamilyMovieLocalPreviewEnabled(input.host)) return false;

  const pathname = (input.pathname ?? "").toLowerCase();
  if (
    pathname === "/first-family-movie/preview" ||
    pathname.endsWith("/first-family-movie/preview")
  ) {
    return true;
  }

  if (isTruthyFlag(Array.isArray(input.preview) ? input.preview[0] : input.preview)) {
    return true;
  }

  const search = input.search ?? "";
  if (!search) return false;
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    return isTruthyFlag(params.get("preview"));
  } catch {
    return false;
  }
}
