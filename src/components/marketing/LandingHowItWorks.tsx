import Link from "next/link";
import { landingContent } from "@/content/landing";
import { LANDING_MEDIA } from "@/content/landing-media";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { CinematicSection } from "@/components/cinematic";

/**
 * How it works — cinematic full-bleed stage (not a SaaS step card grid).
 */
export function LandingHowItWorks() {
  const { howItWorks } = landingContent;

  return (
    <CinematicSection
      id={howItWorks.id}
      treatment="bandWarm"
      mediaType="image"
      src={LANDING_MEDIA.preserve.image}
      overlay="hero-cinematic"
      layout="center"
      viewport
      className="landing-stage landing-how landing-how--cinematic"
      contentClassName="landing-stage-content landing-how-cinematic-content"
      aria-labelledby="landing-how-title"
    >
      <LandingReveal className="landing-how-cinematic-inner">
        <p className="landing-eyebrow landing-eyebrow--on-media">
          {howItWorks.eyebrow}
        </p>
        <h2
          id="landing-how-title"
          className="landing-display landing-display--cinematic"
        >
          {howItWorks.title}
        </h2>
        <p className="landing-lead landing-lead--on-media">
          {howItWorks.support}
        </p>
        <ol className="landing-how-cinematic-steps">
          {howItWorks.steps.map((step, i) => (
            <li key={step.title} className="landing-how-cinematic-step">
              <span className="landing-how-cinematic-index" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="landing-how-cinematic-step-title">{step.title}</h3>
                <p className="landing-how-cinematic-step-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link
          href="/sign-up"
          className="ui-btn ui-btn-primary ui-btn-lg landing-cta-primary"
        >
          Begin your vault
        </Link>
      </LandingReveal>
    </CinematicSection>
  );
}
