/**
 * Locale-aware replacement for the old static `COPY` catalog.
 * Prefer `t("upload.dropTitle")` / `useTranslations()` in new code.
 */

import type { TranslateFn } from "@/lib/i18n/types";

export function copyFromT(t: TranslateFn) {
  return {
    upload: {
      dropTitle: t("upload.dropTitle"),
      dropBody: t("upload.dropBody"),
      chooseFiles: t("upload.chooseFiles"),
      safetyNote: t("upload.safetyNote"),
      received: t("upload.received"),
      status: {
        queued: t("upload.statusQueued"),
        requesting_url: t("upload.statusRequesting"),
        uploading: (pct: number) => t("upload.statusUploading", { pct }),
        finalizing: t("upload.statusFinalizing"),
        done: t("upload.statusDone"),
        error: t("upload.statusError"),
      },
    },
    review: {
      pendingOne: t("review.pendingOne"),
      pendingMany: (n: number) => t("review.pendingMany", { n }),
      attention: t("review.attention"),
      mixed: t("review.mixed"),
    },
    movie: {
      status: {
        queued: t("movie.statusQueued"),
        processing: t("movie.statusProcessing"),
        failed: t("movie.statusFailed"),
        ready: t("movie.statusReady"),
      },
      craftingTitle: t("movie.craftingTitle"),
      craftingBody: t("movie.craftingBody"),
      craftingHint: t("movie.craftingHint"),
      waiting: t("movie.waiting"),
      rendering: t("movie.rendering"),
      preparing: t("movie.preparing"),
      readyTitle: t("movie.readyTitle"),
      failedTitle: t("movie.failedTitle"),
      failedRetry: t("movie.failedRetry"),
      emptyMedia: t("movie.emptyMedia"),
    },
    empty: {
      memoriesFirst: {
        title: t("empty.memoriesFirstTitle"),
        description: t("empty.memoriesFirstDescription"),
      },
      memoriesDefault: {
        title: t("empty.memoriesDefaultTitle"),
        description: t("empty.memoriesDefaultDescription"),
      },
      memoriesShared: {
        title: t("empty.memoriesSharedTitle"),
        description: t("empty.memoriesSharedDescription"),
      },
      mediaOwn: {
        title: t("empty.mediaOwnTitle"),
        description: t("empty.mediaOwnDescription"),
      },
      mediaShared: {
        title: t("empty.mediaSharedTitle"),
        description: t("empty.mediaSharedDescription"),
      },
      people: {
        title: t("empty.peopleTitle"),
        description: t("empty.peopleDescription"),
      },
      movies: {
        title: t("empty.moviesTitle"),
        description: t("empty.moviesDescription"),
      },
      moviesMemory: {
        title: t("empty.moviesMemoryTitle"),
        description: t("empty.moviesMemoryDescription"),
      },
      familyMembers: {
        title: t("empty.familyMembersTitle"),
        description: t("empty.familyMembersDescription"),
      },
      notifications: {
        title: t("empty.notificationsTitle"),
        description: t("empty.notificationsDescription"),
      },
      createMemoryNoMedia: {
        title: t("empty.createMemoryNoMediaTitle"),
        description: t("empty.createMemoryNoMediaDescription"),
      },
      documentsCategory: {
        title: t("empty.documentsCategoryTitle"),
        description: t("empty.documentsCategoryDescription"),
      },
      documentsSearch: {
        title: t("empty.documentsSearchTitle"),
        description: t("empty.documentsSearchDescription"),
      },
    },
    tips: {
      moderation: t("tips.moderation"),
      createMovie: t("tips.createMovie"),
      peopleFaces: t("tips.peopleFaces"),
      familyShare: t("tips.familyShare"),
      storageQuota: t("tips.storageQuota"),
      privateDocuments: t("tips.privateDocuments"),
      digitalLegacy: t("tips.digitalLegacy"),
    },
    legacy: {
      title: t("legacy.title"),
      subtitle: t("legacy.subtitle"),
      overviewLead: t("legacy.overviewLead"),
      overviewPrivacy: t("legacy.overviewPrivacy"),
      secureWarning: t("legacy.secureWarning"),
      secureWarningShort: t("legacy.secureWarningShort"),
      secureRevealConfirm: t("legacy.secureRevealConfirm"),
      documentDownloadConfirm: t("legacy.documentDownloadConfirm"),
      documentViewConfirm: t("legacy.documentViewConfirm"),
    },
  } as const;
}
