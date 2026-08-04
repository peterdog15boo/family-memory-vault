"use client";

import { useState } from "react";
import { LegacyVideoLibrary } from "@/components/legacy/LegacyVideoLibrary";
import { LegacyVideoRecorder } from "@/components/legacy/LegacyVideoRecorder";
import { LegacyVideoUploader } from "@/components/legacy/LegacyVideoUploader";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import { LEGACY_VIDEO_SECTION_LABELS } from "@/lib/legacy/types";

type LegacyVideosPanelProps = {
  sectionType: LegacyVideoSectionType;
  /** Optional multi-section picker for upload (and filter for library). */
  sectionOptions?: LegacyVideoSectionType[];
  initialVideos?: SerializedLegacyVideo[];
  showRecorder?: boolean;
  showUploader?: boolean;
  defaultRecordTitle?: string;
};

/**
 * Record + upload into a Digital Legacy section, with a shared saved list.
 * Supports adding multiple videos one after another.
 */
export function LegacyVideosPanel({
  sectionType,
  sectionOptions,
  initialVideos = [],
  showRecorder = true,
  showUploader = true,
  defaultRecordTitle,
}: LegacyVideosPanelProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [error, setError] = useState<string | null>(null);

  const options = sectionOptions?.length ? sectionOptions : [sectionType];
  const libraryVideos =
    options.length === 1
      ? videos.filter((v) => v.sectionType === sectionType)
      : videos.filter((v) => options.includes(v.sectionType));

  function handleSaved(video: SerializedLegacyVideo) {
    setError(null);
    setVideos((prev) => {
      if (prev.some((row) => row.id === video.id)) return prev;
      return [...prev, video];
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          Videos · {LEGACY_VIDEO_SECTION_LABELS[sectionType]}
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {showRecorder && showUploader
            ? "Record a short message or upload a video you’ve already made. You can add as many as you like — each one stays private in this section."
            : showUploader
              ? "Upload a video you’ve already made. You can add as many as you like — each one stays private in your Digital Legacy."
              : "Record a short message. You can add as many as you like — each one stays private in this section."}
        </p>
      </div>

      {showRecorder ? (
        <LegacyVideoRecorder
          sectionType={sectionType}
          defaultTitle={defaultRecordTitle}
          showLibrary={false}
          onSaved={handleSaved}
        />
      ) : null}

      {showUploader ? (
        <LegacyVideoUploader
          sectionType={sectionType}
          sectionOptions={options.length > 1 ? options : undefined}
          onUploaded={handleSaved}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <LegacyVideoLibrary
        videos={libraryVideos}
        onRemoved={(id) =>
          setVideos((prev) => prev.filter((row) => row.id !== id))
        }
        onError={setError}
      />
    </div>
  );
}
