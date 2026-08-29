import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  buildSimpleDocx,
  buildSimpleTextPdf,
  generateWillDraftPlainText,
  getActiveWillDraft,
  WILL_DISCLAIMER_TEXT,
} from "@/lib/will-planner/server";
import type { WillAnswers } from "@/lib/will-planner";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/legacy/will/download?format=pdf|docx|txt
 * Owner-only. Includes required disclaimer on page 1 / body.
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
    if (!draft || draft.status !== "draft_ready" || !draft.generatedMarkdown) {
      return apiError("No ready draft to download. Build the attorney draft first.", {
        status: 404,
        code: "not_found",
      });
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

    if (format === "txt") {
      const text = [
        plain,
        "",
        "---",
        WILL_DISCLAIMER_TEXT,
        "",
        "Email / share footer: " + WILL_DISCLAIMER_TEXT,
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
      const docx = buildSimpleDocx(
        "Estate Planning Interview Draft — Family Memory Vault",
        plain,
        { disclaimer: WILL_DISCLAIMER_TEXT },
      );
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

    const pdf = buildSimpleTextPdf(
      "Estate Planning Interview Draft — Family Memory Vault",
      plain,
      { footerDisclaimer: WILL_DISCLAIMER_TEXT },
    );

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
