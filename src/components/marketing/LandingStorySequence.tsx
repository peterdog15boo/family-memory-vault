import Link from "next/link";
import { landingContent, type LandingStoryStage } from "@/content/landing";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { CinematicSection } from "@/components/cinematic";

/**
 * Full-viewport cinematic story stages — one emotional beat per scroll stop.
 * Every stage is edge-to-edge media with centered type (Apple-like staging,
 * warmer and family-centered). Split/inset panels intentionally removed.
 */
function CinematicStage({ stage }: { stage: LandingStoryStage }) {
  const mediaType = stage.backgroundVideo
    ? "video"
    : stage.backgroundImage
      ? "image"
      : "none";

  return (
    <CinematicSection
      id={stage.id}
      treatment={stage.treatment}
      mediaType={mediaType}
      src={stage.backgroundVideo ?? stage.backgroundImage}
      poster={stage.backgroundImageFallback ?? stage.backgroundImage}
      imageAlt={stage.imageAlt}
      overlay="hero-cinematic"
      layout={stage.layout}
      mediaFilter="clear"
      viewport
      className={`landing-stage landing-story-stage landing-story-stage--cinematic landing-story-stage--${stage.id}`}
      contentClassName="landing-stage-content landing-story-stage-cinematic-content"
      aria-labelledby={`landing-stage-${stage.id}`}
    >
      <LandingReveal
        direction="up"
        className="landing-story-stage-copy landing-story-stage-copy--cinematic"
      >
        <p className="landing-eyebrow landing-eyebrow--on-media">
          {stage.eyebrow}
        </p>
        <h2
          id={`landing-stage-${stage.id}`}
          className="landing-display landing-display--cinematic"
        >
          {stage.title}
        </h2>
        <p className="landing-lead landing-lead--on-media">{stage.body}</p>
        {stage.cta ? (
          <Link
            href={stage.cta.href}
            className="landing-story-stage-cta ui-btn ui-btn-primary ui-btn-lg landing-cta-primary inline-flex"
          >
            {stage.cta.label}
          </Link>
        ) : null}
      </LandingReveal>
    </CinematicSection>
  );
}

export function LandingStorySequence() {
  return (
    <div className="landing-story-sequence">
      {landingContent.storyStages.map((stage) => (
        <CinematicStage key={stage.id} stage={stage} />
      ))}
    </div>
  );
}
