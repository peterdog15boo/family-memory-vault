import { HERO_FRAME_IMAGES } from "@/content/auth-visuals";

/**
 * Original landing hero collage — floating photo frames with real imagery.
 * Stays decorative behind the headline; Modern landing uses cinematic media instead.
 */
export function HeroVisual() {
  return (
    <div className="hero-visual pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(74,124,111,0.12),transparent_55%),radial-gradient(ellipse_at_20%_80%,rgba(196,168,125,0.16),transparent_50%)]" />

      {HERO_FRAME_IMAGES.map((frame) => (
        <div key={frame.id} className={frame.className}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static public marketing assets */}
          <img
            src={frame.src}
            alt={frame.alt}
            className="photo-inner photo-inner-image"
            loading="eager"
            decoding="async"
          />
        </div>
      ))}

      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-canvas via-canvas/92 to-transparent sm:w-[62%] lg:w-[52%]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas to-transparent" />
    </div>
  );
}
