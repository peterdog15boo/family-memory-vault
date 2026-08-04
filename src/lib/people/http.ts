import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

/**
 * Require a signed-in, non-suspended Clerk user for people API routes.
 */
export async function requirePeopleApiUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  return requireApiUser();
}

/** Map PeopleError (and unknown errors) to JSON responses. */
export function peopleApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  return apiErrorFromUnknown(error, fallbackMessage);
}
