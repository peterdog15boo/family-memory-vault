import { landingContent } from "@/content/landing";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { CinematicSection } from "@/components/cinematic";

/**
 * Emotional promise — full-bleed photography, one idea, large type.
 */
export function LandingPromise() {
  const { promise } = landingContent;
  const mediaType = promise.backgroundVideo
    ? "video"
    : promise.backgroundImage
      ? "image"
      : "none";

  return (
    <CinematicSection
      id={promise.id}
      treatment={promise.treatment}
      mediaType={mediaType}
      src={promise.backgroundVideo ?? promise.backgroundImage}
      poster={promise.backgroundImageFallback ?? promise.backgroundImage}
      overlay="hero-cinematic"
      layout="center"
      mediaFilter="clear"
      viewport
      className="landing-stage landing-promise landing-promise--cinematic"
      contentClassName="landing-stage-content landing-promise-content"
      aria-labelledby="landing-promise-title"
    >
      <LandingReveal className="landing-promise-inner landing-promise-inner--cinematic">
        <p className="landing-eyebrow landing-eyebrow--on-media">
          {promise.eyebrow}
        </p>
        <h2
          id="landing-promise-title"
          className="landing-display landing-display--cinematic"
        >
          {promise.headline}
        </h2>
        <p className="landing-lead landing-lead--on-media landing-promise-lead">
          {promise.support}
        </p>
      </LandingReveal>
    </CinematicSection>
  );
}
