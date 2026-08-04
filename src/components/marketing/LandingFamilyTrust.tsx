import { landingContent } from "@/content/landing";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { CinematicSection } from "@/components/cinematic";

/**
 * Family / love / trust — full-bleed photographic stage with three quiet pillars.
 */
export function LandingFamilyTrust() {
  const { familyTrust } = landingContent;
  const mediaType = familyTrust.backgroundVideo
    ? "video"
    : familyTrust.backgroundImage
      ? "image"
      : "none";

  return (
    <CinematicSection
      id={familyTrust.id}
      treatment={familyTrust.treatment}
      mediaType={mediaType}
      src={familyTrust.backgroundVideo ?? familyTrust.backgroundImage}
      poster={
        familyTrust.backgroundImageFallback ?? familyTrust.backgroundImage
      }
      overlay="hero-cinematic"
      layout="center"
      viewport
      className="landing-stage landing-trust landing-trust--cinematic"
      contentClassName="landing-stage-content landing-trust-cinematic-content"
      aria-labelledby="landing-trust-title"
    >
      <LandingReveal className="landing-trust-cinematic-inner">
        <p className="landing-eyebrow landing-eyebrow--on-media">
          {familyTrust.eyebrow}
        </p>
        <h2
          id="landing-trust-title"
          className="landing-display landing-display--cinematic"
        >
          {familyTrust.title}
        </h2>
        <p className="landing-lead landing-lead--on-media">
          {familyTrust.support}
        </p>
        <ul className="landing-trust-cinematic-pillars">
          {familyTrust.items.map((item) => (
            <li key={item.title} className="landing-trust-cinematic-pillar">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </LandingReveal>
    </CinematicSection>
  );
}
