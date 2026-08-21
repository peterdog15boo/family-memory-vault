"use client";

import { MediaIntakePanel } from "@/components/media/MediaIntakePanel";
import { useRouter } from "next/navigation";

type UploadPageIntakeProps = {
  storageBlocked?: boolean;
  planName?: string;
};

/**
 * Upload page intake — device uploader plus the same Import photos menu
 * used on Memories / Photos (Drive, Dropbox, social with honest limits).
 */
export function UploadPageIntake({
  storageBlocked = false,
  planName = "your",
}: UploadPageIntakeProps) {
  const router = useRouter();

  return (
    <MediaIntakePanel
      variant="page"
      showAttachToggle={false}
      defaultAttachToMemory={false}
      showUploadButton={false}
      initialShowUploader
      compact={false}
      storageBlocked={storageBlocked}
      planName={planName}
      onMediaReady={() => {
        router.refresh();
      }}
    />
  );
}
