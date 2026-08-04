import { LandingFinalCta } from "@/components/marketing/LandingFinalCta";
import { LandingHero } from "@/components/marketing/LandingHero";
import { LandingPromise } from "@/components/marketing/LandingPromise";
import { LandingStorySequence } from "@/components/marketing/LandingStorySequence";

/**
 * Modern theme public landing — cinematic full-viewport stages.
 * Pricing lives on /pricing (not mid-scroll product cards).
 * Original theme continues to use `LandingOriginal`.
 */
export function LandingModern() {
  return (
    <div className="landing-modern">
      <LandingHero />
      <LandingPromise />
      <LandingStorySequence />
      <LandingFinalCta />
    </div>
  );
}
