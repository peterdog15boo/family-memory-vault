import Link from "next/link";
import { landingContent } from "@/content/landing";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { CinematicSection } from "@/components/cinematic";

/**
 * Final cinematic CTA — full-bleed photography + strong invitation.
 */
export function LandingFinalCta() {
  const { finalCta } = landingContent;

  const mediaType = finalCta.backgroundVideo
    ? "video"
    : finalCta.backgroundImage
      ? "image"
      : "none";

  return (
    <CinematicSection
      id={finalCta.id}
      treatment={finalCta.treatment}
      mediaType={mediaType}
      src={finalCta.backgroundVideo ?? finalCta.backgroundImage}
      poster={finalCta.backgroundImageFallback ?? finalCta.backgroundImage}
      overlay="hero-cinematic"
      layout="center"
      mediaFilter="clear"
      viewport
      glass={false}
      className="landing-stage landing-final-cta landing-final-cta--cinematic"
      contentClassName="landing-stage-content landing-final-cta-content"
      aria-labelledby="landing-final-title"
    >
      <LandingReveal className="landing-final-cta-inner landing-final-cta-inner--cinematic">
        <h2
          id="landing-final-title"
          className="landing-display landing-display--cinematic"
        >
          {finalCta.title}
        </h2>
        <p className="landing-lead landing-lead--on-media">{finalCta.support}</p>
        <div className="landing-final-cta-actions">
          <Link
            href={finalCta.primaryCta.href}
            className="ui-btn ui-btn-primary ui-btn-lg landing-cta-primary"
          >
            {finalCta.primaryCta.label}
          </Link>
          <Link
            href={finalCta.secondaryCta.href}
            className="ui-btn ui-btn-ghost ui-btn-lg landing-cta-ghost-on-media"
          >
            {finalCta.secondaryCta.label}
          </Link>
        </div>
      </LandingReveal>
    </CinematicSection>
  );
}
