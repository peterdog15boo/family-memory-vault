import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  buildSimpleDocx,
  buildSimpleTextPdf,
  generateWillDraftPlainText,
  getActiveWillDraft,
  WILL_DISCLAIMER_TEXT,
  WILL_DRAFT_PAGE_HEADER,
  willDraftPageFooter,
} from "@/lib/will-planner/server";
import type { WillAnswers } from "@/lib/will-planner";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/legacy/will/download?format=pdf|docx|txt
 * Owner-only. Header/footer + cover sheet from generator.
 */
export async function GET(request: Request) {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `will-download:${userId}`,
    RATE_LIMITS.willPlannerDownload.limit,
    RATE_LIMITS.willPlannerDownload.windowMs,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "txt").toLowerCase();
  if (format !== "pdf" && format !== "txt" && format !== "docx") {
    return apiError("format must be pdf, docx, or txt", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const draft = await getActiveWillDraft(userId);
    if (!draft || !draft.generatedMarkdown) {
      return apiError(
        "No ready draft to download. Build the attorney draft first.",
        {
          status: 404,
          code: "not_found",
        },
      );
    }

    const answers = (draft.answers ?? {}) as WillAnswers;
    const plain = generateWillDraftPlainText(answers);
    const nameSlug =
      (answers.fullLegalName ?? "will-draft")
        .trim()
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "will-draft";
    const instrumentTitle = `LAST WILL AND TESTAMENT OF ${(answers.fullLegalName ?? "TESTATOR").toUpperCase()} — DRAFT`;
    const footer = willDraftPageFooter(answers.stateCode);

    if (format === "txt") {
      const text = [
        WILL_DRAFT_PAGE_HEADER,
        "",
        plain,
        "",
        "---",
        WILL_DISCLAIMER_TEXT,
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

    if (format === "docx") {
      const docx = buildSimpleDocx(instrumentTitle, plain, {
        disclaimer: `${WILL_DRAFT_PAGE_HEADER}\n${footer}`,
      });
      return new NextResponse(Buffer.from(docx), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${nameSlug}-attorney-draft.docx"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const pdf = buildSimpleTextPdf(instrumentTitle, plain, {
      pageHeader: WILL_DRAFT_PAGE_HEADER,
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
