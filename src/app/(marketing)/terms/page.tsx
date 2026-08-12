import Link from "next/link";
import { TermsOfServiceDocument } from "@/components/legal/TermsOfServiceDocument";
import { TERMS_OF_SERVICE_VERSION } from "@/content/legal/terms-of-service";

export const metadata = {
  title: "Terms of Service — Family Memory Vault",
  description:
    "Terms of Service for Family Memory Vault — how the service works, your content, and your responsibilities.",
};

/**
 * Public readable Terms of Service — same canonical source as /terms-agree.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-[var(--page-pad-x,1.25rem)] py-16 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Legal
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Document version {TERMS_OF_SERVICE_VERSION}
      </p>

      <div className="mt-8">
        <TermsOfServiceDocument showClosing={false} />
      </div>

      <p className="mt-12 text-sm text-ink-muted">
        Also see our{" "}
        <Link
          href="/privacy"
          className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
        >
          Privacy overview
        </Link>
        .
      </p>
    </div>
  );
}
