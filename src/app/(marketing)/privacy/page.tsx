import Link from "next/link";

export const metadata = {
  title: "Privacy — Family Memory Vault",
  description:
    "How Family Memory Vault handles privacy, sharing, and your family data.",
};

/**
 * Public privacy overview — honest product behavior, not invented legal claims.
 * Chrome (nav/footer) comes from `(marketing)/layout.tsx`.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-[var(--page-pad-x,1.25rem)] py-16 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Privacy
      </p>
      <h1 className="mt-3 font-display text-4xl tracking-tight text-ink sm:text-5xl">
        Built for families, not feeds
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
        Family Memory Vault is a private home for photos, stories, and
        keepsakes. We design every flow around consent, quiet sharing, and
        safeguards — so you can focus on what matters.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink-muted sm:text-base">
        <section>
          <h2 className="font-display text-xl tracking-tight text-ink">
            Your vault is private by default
          </h2>
          <p className="mt-2">
            There are no public profiles and no algorithmic feed for other
            families to discover you. Content stays in your account unless you
            invite someone into your family or share a specific memory.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl tracking-tight text-ink">
            Family sharing is intentional
          </h2>
          <p className="mt-2">
            People you invite can see the memories and media you choose to
            share. Roles help you decide who can upload or manage the family.
            You can review invites and membership anytime in Settings → Family.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl tracking-tight text-ink">
            Private Documents &amp; Digital Legacy
          </h2>
          <p className="mt-2">
            Private Documents and Digital Legacy stay owner-only. Family
            membership never unlocks those areas. Emergency Access is a
            separate, explicit designation you control.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl tracking-tight text-ink">
            Account &amp; notifications
          </h2>
          <p className="mt-2">
            Sign-in email and security settings are managed by Clerk. In
            Settings → Account &amp; privacy you can update your display name,
            choose which emails and in-app alerts you receive, and opt in to
            occasional product updates (off by default).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl tracking-tight text-ink">
            Questions
          </h2>
          <p className="mt-2">
            This page describes how the product works today. For account
            security changes (password, MFA, email addresses), use Manage
            account from Settings.
          </p>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/settings#account-privacy" className="ui-btn ui-btn-primary">
          Account &amp; privacy settings
        </Link>
        <Link href="/" className="ui-btn ui-btn-secondary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
