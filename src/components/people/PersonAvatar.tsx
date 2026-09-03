"use client";

import { useCallback, useState, type SyntheticEvent } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FaceBoundingBox } from "@/lib/people/types";
import {
  avatarImageLayoutStyle,
  resolveAvatarFraming,
  type AvatarFraming,
  type StoredAvatarFraming,
} from "@/lib/people/avatar-framing";

type PersonAvatarProps = {
  previewUrl: string | null;
  boundingBox?: FaceBoundingBox | null;
  /** Manual framing from the person record (null fields ⇒ auto). */
  framing?: StoredAvatarFraming | null;
  /** Override resolved framing (editor live preview). */
  framingOverride?: AvatarFraming | null;
  alt: string;
  className?: string;
  /** Circular crop for list cards; soft square for detail hero. */
  shape?: "circle" | "soft";
};

/**
 * Face-aware thumbnail: centers the face (or saved focus) and zooms so it
 * fills the circle instead of leaving a tiny head in a wide photo.
 */
export function PersonAvatar({
  previewUrl,
  boundingBox,
  framing,
  framingOverride,
  alt,
  className,
  shape = "circle",
}: PersonAvatarProps) {
  const resolved =
    framingOverride ?? resolveAvatarFraming(framing, boundingBox);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    null,
  );

  const onLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, []);

  const imageStyle = natural
    ? avatarImageLayoutStyle(natural.w, natural.h, resolved)
    : ({
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${resolved.focusX * 100}% ${resolved.focusY * 100}%`,
        transform: `scale(${resolved.zoom})`,
        transformOrigin: `${resolved.focusX * 100}% ${resolved.focusY * 100}%`,
      } as const);

  return (
    <div
      className={cn(
        "person-avatar relative overflow-hidden bg-gradient-to-br from-[#d9cfc0] via-[#e8dfd2] to-[#c5b8a4]",
        shape === "circle" ? "rounded-full" : "rounded-2xl",
        className,
      )}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={previewUrl}
          src={previewUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={onLoad}
          className="select-none"
          style={imageStyle}
        />
      ) : (
        <div className="person-avatar-placeholder flex h-full w-full items-center justify-center text-ink/25">
          <UserRound className="size-[40%] max-w-16" aria-hidden />
          <span className="sr-only">{alt}</span>
        </div>
      )}
      <span
        className="person-avatar-ring pointer-events-none absolute inset-0 ring-1 ring-inset ring-ink/10"
        aria-hidden
      />
    </div>
  );
}
