"use client";

import { MediaIntakePanel } from "@/components/media/MediaIntakePanel";

/**
 * Photos library intake — same Import menu / OAuth / pipeline as Memories,
 * without memory attach. Progress + completion stay on the Photos page.
 */
export function MediaLibraryHeaderActions() {
  return (
    <MediaIntakePanel
      variant="page"
      showAttachToggle={false}
      defaultAttachToMemory={false}
      showUploadButton
      compact
    />
  );
}
