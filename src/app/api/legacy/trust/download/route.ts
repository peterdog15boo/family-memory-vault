import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  buildTrustDraftPdf,
  generateTrustDraftPlainText,
  getActiveTrustDraft,
  TRUST_DISCLAIMER_TEXT,
  TRUST_DRAFT_PAGE_HEADER,
  trustDraftPageFooter,
} from "@/lib/trust-planner/server";
import type { TrustAnswers } from "@/lib/trust-planner";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/legacy/trust/download?format=pdf|txt
 * Owner-only. Disclaimer on page 1 via generator body + PDF header/footer.
 */
export async function GET(request: Request) {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `trust-download:${userId}`,
    RATE_LIMITS.trustPlannerDownload.limit,
    RATE_LIMITS.trustPlannerDownload.windowMs,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "txt").toLowerCase();
  if (format !== "pdf" && format !== "txt") {
    return apiError("format must be pdf or txt", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const draft = await getActiveTrustDraft(userId);
    if (!draft || !draft.generatedMarkdown) {
      return apiError(
        "No ready draft to download. Build the attorney draft first.",
        {
          status: 404,
          code: "not_found",
        },
      );
    }

    const answers = (draft.answers ?? {}) as TrustAnswers;
    const plain = generateTrustDraftPlainText(answers, {
      linkedWillDraftId: draft.linkedWillDraftId,
    });
    const nameSlug =
      (answers.fullLegalName ?? "trust-draft")
        .trim()
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "trust-draft";
    const instrumentTitle = `REVOCABLE LIVING TRUST PLANNING DRAFT OF ${(answers.fullLegalName ?? "GRANTOR").toUpperCase()} — NOT A VALID TRUST`;
    const footer = trustDraftPageFooter(answers.stateCode);

    if (format === "txt") {
      const text = [
        TRUST_DRAFT_PAGE_HEADER,
        "",
        plain,
        "",
        "---",
        TRUST_DISCLAIMER_TEXT,
        "",
        footer,
      ].join("\n");

      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nameSlug}-attorney-draft.txt"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const pdf = buildTrustDraftPdf(instrumentTitle, plain, {
      pageHeader: TRUST_DRAFT_PAGE_HEADER,
      pageFooter: footer,
      stateCode: answers.stateCode,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nameSlug}-attorney-draft.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to download draft");
  }
}
