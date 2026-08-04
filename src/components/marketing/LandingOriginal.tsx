import Link from "next/link";
import { HeroVisual } from "@/components/HeroVisual";

/**
 * Original marketing landing — preserved for the Original theme.
 */
export function LandingOriginal() {
  return (
    <>
      <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        <HeroVisual />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-6 py-16">
          <div className="max-w-xl">
            <p className="animate-fade-up font-display text-3xl tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Family Memory Vault
            </p>
            <h1 className="animate-fade-up-delay-1 mt-6 text-balance font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              Preserve your family’s most important memories — privately and
              safely
            </h1>
            <p className="animate-fade-up-delay-2 mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
              A calm, family-safe space for photos, stories, and keepsakes —
              kept private by design, shared only with the people you choose.
            </p>
            <div
              id="get-started"
              className="animate-fade-up-delay-3 mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/sign-up"
                className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-deep"
              >
                Start preserving
              </Link>
              <Link
                href="/pricing"
                className="rounded-md px-5 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                View plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="privacy"
        className="border-t border-ink/8 bg-canvas-deep/60"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Privacy comes first
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            Your family’s memories are not content for the open web. We design
            every flow around consent, quiet sharing, and safeguards that keep
            younger family members safe — so you can focus on what matters.
          </p>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-ink/8">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Built for families, not feeds
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            Collect the moments that matter, organize them with care, and invite
            only the people you trust. No public profiles, no algorithmic
            pressure — just a warm vault for your family’s story.
          </p>
        </div>
      </section>
    </>
  );
}
