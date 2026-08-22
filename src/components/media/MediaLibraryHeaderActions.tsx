"use client";

import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { MediaIntakePanel } from "@/components/media/MediaIntakePanel";
import { useTranslations } from "@/components/i18n/LocaleProvider";

type MediaLibraryHeaderActionsProps = {
  /** Show a fast path into movie creation when the library has usable media. */
  showMakeMovie?: boolean;
  /** Deep-link target for Make a movie (memory or create-with-intent). */
  makeMovieHref?: string;
};

/**
 * Photos library intake — same Import menu / OAuth / pipeline as Memories,
 * without memory attach. Progress + completion stay on the Photos page.
 */
export function MediaLibraryHeaderActions({
  showMakeMovie = false,
  makeMovieHref = "/memories/new?intent=movie",
}: MediaLibraryHeaderActionsProps) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showMakeMovie ? (
        <Link href={makeMovieHref} className="ui-btn ui-btn-secondary ui-btn-sm">
          <Clapperboard className="size-3.5" aria-hidden />
          {t("pages.moviesMake")}
        </Link>
      ) : null}
      <MediaIntakePanel
        variant="page"
        showAttachToggle={false}
        defaultAttachToMemory={false}
        showUploadButton
        compact
      />
    </div>
  );
}
