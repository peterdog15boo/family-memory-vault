"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/media-section/usePrefersReducedMotion";

export type LandingRevealDirection = "up" | "left" | "right";

/**
 * Soft scroll reveal for Modern landing / cinematic sections.
 * Respects prefers-reduced-motion (shows immediately, no transform).
 */
export function LandingReveal({
  children,
  className,
  delayMs = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  direction?: LandingRevealDirection;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className={cn(
        "landing-reveal cinematic-reveal",
        `landing-reveal--${direction}`,
        visible && "landing-reveal-visible cinematic-reveal--visible",
        className,
      )}
      style={{ transitionDelay: visible ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  );
}
