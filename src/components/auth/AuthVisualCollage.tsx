import { LOGIN_PANEL_IMAGES } from "@/content/auth-visuals";
import { cn } from "@/lib/utils";

/**
 * Warm photo collage for sign-in / sign-up — complements landing imagery.
 */
export function AuthVisualCollage({ className }: { className?: string }) {
  return (
    <div className={cn("auth-visual", className)}>
      <div className="auth-visual-grid">
        {LOGIN_PANEL_IMAGES.map((panel, index) => (
          <figure
            key={panel.id}
            className={cn(
              "auth-visual-panel",
              panel.span === "tall" && "auth-visual-panel--tall",
              panel.span === "wide" && "auth-visual-panel--wide",
            )}
            style={{ animationDelay: `${0.12 + index * 0.14}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static public marketing assets */}
            <img
              src={panel.src}
              alt={panel.alt}
              className="auth-visual-img"
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </figure>
        ))}
      </div>
      <div className="auth-visual-veil" aria-hidden />
    </div>
  );
}
