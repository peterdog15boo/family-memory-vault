"use client";

import { useEffect, useRef } from "react";
import { registerLiveRegions } from "@/lib/a11y/announce";

/**
 * Mounts visually hidden aria-live regions used by announce().
 * Renders nothing visible — no layout, theme, or focus impact.
 */
export function LiveAnnouncer() {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const polite = politeRef.current;
    const assertive = assertiveRef.current;
    if (!polite || !assertive) return;

    registerLiveRegions({ polite, assertive });
    return () => registerLiveRegions(null);
  }, []);

  return (
    <div
      id="fmv-live-announcer"
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-px w-px overflow-hidden opacity-0"
      style={{
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
      }}
      aria-hidden={false}
    >
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />
    </div>
  );
}
