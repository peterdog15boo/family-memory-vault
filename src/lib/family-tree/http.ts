import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { FamilyTreeError } from "@/lib/family-tree";
import {
  canEditFamilyTree,
  canViewFamilyTree,
  resolveFamilyTreeAccess,
  type FamilyTreeAccessContext,
} from "@/lib/family-tree/access";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { canUseFamilyTree } from "@/lib/plans/gates";
import { planGateDeniedResponse } from "@/lib/auth/plan-api";

export type FamilyTreeApiAuth = {
  ok: true;
  userId: string;
  access: FamilyTreeAccessContext;
};

/**
 * Require signed-in user who can open a Family Tree (own plan or shared view).
 */
export async function requireFamilyTreeApiUser(): Promise<
  FamilyTreeApiAuth | { ok: false; response: NextResponse }
> {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult;

  const access = await resolveFamilyTreeAccess(authResult.userId);
  if (!access?.canView) {
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

  return { ok: true, userId: authResult.userId, access };
}

/**
 * Require edit rights on the resolved tree (or an explicit tree owner).
 */
export async function requireFamilyTreeEditAccess(
  treeOwnerId?: string,
): Promise<
  | {
      ok: true;
      userId: string;
      treeOwnerId: string;
      access: FamilyTreeAccessContext;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireFamilyTreeApiUser();
  if (!auth.ok) return auth;

  const ownerId = treeOwnerId ?? auth.access.treeOwnerId;
  const allowed = await canEditFamilyTree(auth.userId, ownerId);
  if (!allowed) {
    return {
      ok: false,
      response: apiError("You can view this tree but not edit it.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }

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
    access: { ...auth.access, treeOwnerId: ownerId, canEdit: true },
  };
}

export async function requireFamilyTreeViewAccess(
  treeOwnerId?: string,
): Promise<
  | {
      ok: true;
      userId: string;
      treeOwnerId: string;
      access: FamilyTreeAccessContext;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireFamilyTreeApiUser();
  if (!auth.ok) return auth;

  const ownerId = treeOwnerId ?? auth.access.treeOwnerId;
  const allowed = await canViewFamilyTree(auth.userId, ownerId);
  if (!allowed) {
    return {
      ok: false,
      response: apiError("You do not have access to this Family Tree.", {
        status: 403,
        code: "forbidden",
      }),
    };
  }

  const canEdit = await canEditFamilyTree(auth.userId, ownerId);
  return {
    ok: true,
    userId: auth.userId,
    treeOwnerId: ownerId,
    access: {
      ...auth.access,
      treeOwnerId: ownerId,
      canView: true,
      canEdit,
      isOwner: ownerId === auth.userId,
    },
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
