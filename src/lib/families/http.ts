import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { FamilyError, requireActiveFamilyMember } from "@/lib/families";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

/**
 * Require a signed-in, non-suspended Clerk user for family API routes.
 */
export async function requireFamilyApiUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  return requireApiUser();
}

/**
 * Require an active membership; throws FamilyError when missing.
 */
export async function requireFamilyApiMember(
  familyId: string,
  userId: string,
) {
  return requireActiveFamilyMember(familyId, userId);
}

/**
 * Require an active owner membership for the family.
 */
export async function requireFamilyApiOwner(
  familyId: string,
  userId: string,
) {
  const membership = await requireActiveFamilyMember(familyId, userId);
  if (membership.role !== "owner") {
    throw new FamilyError(
      "Only an active family owner can perform this action.",
      { code: "forbidden" },
    );
  }
  return membership;
}

/** Map FamilyError (and unknown errors) to JSON responses. */
export function familyApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  return apiErrorFromUnknown(error, fallbackMessage);
}
