import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { FamilyTreeError } from "@/lib/family-tree";
import {
  canEditFamilyTree,
  canViewFamilyTree,
  resolveFamilyTreeAccess,
  scopeFromAccess,
  type FamilyTreeAccessContext,
} from "@/lib/family-tree/access";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { canUseFamilyTree } from "@/lib/plans/gates";
import { planGateDeniedResponse } from "@/lib/auth/plan-api";

export type FamilyTreeApiAuth = {
  ok: true;
  userId: string;
  access: FamilyTreeAccessContext;
  scope: FamilyTreeScope;
};

/** Optional `?familyId=` from the request URL. */
export function familyIdFromRequestUrl(request: Request): string | null {
  try {
    const id = new URL(request.url).searchParams.get("familyId")?.trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Require signed-in user who can open a Family Tree (own plan or shared view).
 */
export async function requireFamilyTreeApiUser(
  preferredFamilyId?: string | null,
): Promise<FamilyTreeApiAuth | { ok: false; response: NextResponse }> {
  const auth = await requireFamilyTreeMembershipAccess(preferredFamilyId);
  if (!auth.ok) return auth;
  if (!auth.access.canView) {
    return {
      ok: false,
      response: apiError("Family Tree is not available for your account.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }
  return auth;
}

/**
 * Require signed-in user who is a member of the preferred family (or any family).
 * Allows share-off membership so the UI can show “not shared yet” without 403.
 */
export async function requireFamilyTreeMembershipAccess(
  preferredFamilyId?: string | null,
): Promise<FamilyTreeApiAuth | { ok: false; response: NextResponse }> {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult;

  const access = await resolveFamilyTreeAccess(
    authResult.userId,
    preferredFamilyId,
  );
  if (!access) {
    const gate = await canUseFamilyTree(authResult.userId).catch(() => null);
    if (gate && !gate.allowed) {
      return { ok: false, response: planGateDeniedResponse(gate) };
    }
    return {
      ok: false,
      response: apiError("Family Tree is not available for your account.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }

  return {
    ok: true,
    userId: authResult.userId,
    access,
    scope: scopeFromAccess(access),
  };
}

/**
 * Require edit rights on the resolved family tree (optional preferred familyId).
 */
export async function requireFamilyTreeEditAccess(
  preferredFamilyId?: string | null,
): Promise<
  | {
      ok: true;
      userId: string;
      /** @deprecated Prefer scope.peopleOwnerId */
      treeOwnerId: string;
      access: FamilyTreeAccessContext;
      scope: FamilyTreeScope;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireFamilyTreeApiUser(preferredFamilyId);
  if (!auth.ok) return auth;

  const allowed =
    auth.access.canEdit ||
    (await canEditFamilyTree(auth.userId, auth.access.familyId));
  if (!allowed) {
    return {
      ok: false,
      response: apiError("You can view this tree but not edit it.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }

  const ownerId = auth.access.peopleOwnerId;
  // Owner’s plan must still include Family Tree for the vault graph to exist.
  if (ownerId === auth.userId) {
    const gate = await canUseFamilyTree(ownerId);
    if (!gate.allowed) {
      return { ok: false, response: planGateDeniedResponse(gate) };
    }
  } else {
    const ownerGate = await canUseFamilyTree(ownerId).catch(() => ({
      allowed: false as const,
    }));
    if (!ownerGate.allowed) {
      return {
        ok: false,
        response: apiError("This Family Tree is not available right now.", {
          status: 403,
          code: "forbidden",
        }),
      };
    }
  }

  return {
    ok: true,
    userId: auth.userId,
    treeOwnerId: ownerId,
    access: { ...auth.access, canEdit: true },
    scope: scopeFromAccess(auth.access),
  };
}

export async function requireFamilyTreeViewAccess(
  preferredFamilyId?: string | null,
): Promise<
  | {
      ok: true;
      userId: string;
      /** @deprecated Prefer scope.peopleOwnerId */
      treeOwnerId: string;
      access: FamilyTreeAccessContext;
      scope: FamilyTreeScope;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireFamilyTreeApiUser(preferredFamilyId);
  if (!auth.ok) return auth;

  const allowed =
    auth.access.canView ||
    (await canViewFamilyTree(auth.userId, auth.access.familyId));
  if (!allowed) {
    return {
      ok: false,
      response: apiError("You do not have access to this Family Tree.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }

  const canEdit = await canEditFamilyTree(auth.userId, auth.access.familyId);
  return {
    ok: true,
    userId: auth.userId,
    treeOwnerId: auth.access.peopleOwnerId,
    access: {
      ...auth.access,
      canView: true,
      canEdit,
    },
    scope: scopeFromAccess(auth.access),
  };
}

export function familyTreeApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof FamilyTreeError) {
    let status = 400;
    if (error.code === "not_found") status = 404;
    else if (error.code === "plan_limit") status = 403;
    else if (error.code === "conflict") status = 409;
    return apiError(error.message, {
      status,
      code: error.code ?? "validation",
    });
  }
  return apiErrorFromUnknown(error, fallbackMessage);
}
