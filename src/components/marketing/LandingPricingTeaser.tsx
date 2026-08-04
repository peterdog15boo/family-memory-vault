import Link from "next/link";
import { landingContent } from "@/content/landing";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { cn } from "@/lib/utils";

/**
 * Pricing teaser — sparse plan rhythm before the closing invitation.
 */
export function LandingPricingTeaser() {
  const { pricingTeaser } = landingContent;

  return (
    <section
      id={pricingTeaser.id}
      className="landing-stage landing-pricing"
      aria-labelledby="landing-pricing-title"
    >
      <div className="landing-stage-content landing-pricing-content">
        <LandingReveal className="landing-pricing-intro">
          <p className="landing-eyebrow">{pricingTeaser.eyebrow}</p>
          <h2 id="landing-pricing-title" className="landing-display">
            {pricingTeaser.title}
          </h2>
          <p className="landing-lead">{pricingTeaser.support}</p>
        </LandingReveal>

        <div className="landing-pricing-plans">
          {pricingTeaser.plans.map((plan, i) => (
            <LandingReveal key={plan.name} delayMs={50 * i}>
              <div
                className={cn(
                  "landing-price-card",
                  plan.highlighted && "landing-price-card-featured",
                )}
              >
                <p className="landing-price-name">{plan.name}</p>
                <p className="landing-price-amount">{plan.price}</p>
                <p className="landing-price-note">{plan.note}</p>
              </div>
            </LandingReveal>
          ))}
        </div>

        <LandingReveal className="landing-pricing-cta" delayMs={120}>
          <Link
            href={pricingTeaser.cta.href}
            className="ui-btn ui-btn-secondary ui-btn-lg inline-flex"
          >
            {pricingTeaser.cta.label}
          </Link>
        </LandingReveal>
      </div>
    </section>
  );
}
