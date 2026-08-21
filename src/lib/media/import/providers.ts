/**
 * Provider catalog + env-gated availability for media import.
 * Ordered for the Import center: workable sources first.
 */

import type {
  MediaImportProvider,
  MediaImportProviderInfo,
  OAuthMediaImportProvider,
} from "@/lib/media/import/types";

function hasEnv(...keys: string[]): boolean {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

export function isGoogleDriveImportConfigured(): boolean {
  return hasEnv("GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET");
}

export function isDropboxImportConfigured(): boolean {
  return hasEnv("DROPBOX_APP_KEY", "DROPBOX_APP_SECRET");
}

export function isMetaImportConfigured(): boolean {
  return hasEnv("META_APP_ID", "META_APP_SECRET");
}

export function isTikTokImportConfigured(): boolean {
  return hasEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET");
}

/**
 * Import center catalog — priority order:
 * 1) device  2) export zip  3) Dropbox  4) Drive  5) direct social (pending auth)
 */
export function listImportProviderInfo(): MediaImportProviderInfo[] {
  const driveReady = isGoogleDriveImportConfigured();
  const dropboxReady = isDropboxImportConfigured();

  return [
    {
      id: "device",
      label: "Upload from device",
      description: "Choose photos and videos from your camera roll or computer.",
      availability: "ready",
      section: "device",
      priority: 10,
      permissionNote:
        "Files stay in your private library and go through the same safety check as any upload.",
      canConnect: false,
      canBrowse: false,
    },
    {
      id: "export_package",
      label: "Upload export package (zip)",
      description:
        "Import a Facebook, Instagram, TikTok, or Google Takeout zip — the most reliable path for social photos today.",
      availability: "ready",
      section: "export_package",
      priority: 20,
      permissionNote:
        "Use each platform’s official “Download your information” / Takeout tools. We only read photos and videos from the zip — no scraping, no account password.",
      limitationNote:
        "Large archives may be capped per upload. You can upload multiple zips.",
      canConnect: false,
      canBrowse: false,
      acceptsExportZip: true,
      guidedExport: true,
    },
    {
      id: "dropbox",
      label: "Dropbox folder",
      description: "Connect Dropbox and import photos you select from a folder.",
      availability: dropboxReady ? "ready" : "needs_config",
      section: "cloud",
      priority: 30,
      permissionNote:
        "We request read-only access to files you pick. We never modify your Dropbox.",
      canConnect: dropboxReady,
      canBrowse: dropboxReady,
    },
    {
      id: "google_drive",
      label: "Google Drive folder",
      description: "Connect Drive and import photos you select from a folder.",
      availability: driveReady ? "ready" : "needs_config",
      section: "cloud",
      priority: 40,
      permissionNote:
        "We request read-only access to files you pick. We never post or change anything in Drive.",
      canConnect: driveReady,
      canBrowse: driveReady,
    },
    {
      id: "facebook",
      label: "Facebook",
      description: "Direct album connect after Meta authorizes this app.",
      availability: "pending_authorization",
      section: "direct_social",
      priority: 50,
      permissionNote:
        "Meta requires app review for photo library access. Until then, use an official Facebook export zip above.",
      limitationNote:
        "Available after authorization. No scraping — only official Graph APIs when approved.",
      canConnect: false,
      canBrowse: false,
      guidedExport: true,
    },
    {
      id: "instagram",
      label: "Instagram",
      description: "Direct media connect after Meta authorizes this app.",
      availability: "pending_authorization",
      section: "direct_social",
      priority: 60,
      permissionNote:
        "Instagram Graph access is limited and usually needs Meta review. Until then, upload your Instagram export zip.",
      limitationNote:
        "Available after authorization. Prefer Instagram’s data download → zip upload.",
      canConnect: false,
      canBrowse: false,
      guidedExport: true,
    },
    {
      id: "tiktok",
      label: "TikTok",
      description: "Direct library connect is not offered for typical consumer accounts.",
      availability: "pending_authorization",
      section: "direct_social",
      priority: 70,
      permissionNote:
        "TikTok’s developer APIs focus on publishing, not full camera-roll import. Use TikTok’s official export, then upload the zip.",
      limitationNote:
        "Available after authorization if TikTok grants library scopes. Until then, use export package upload.",
      canConnect: false,
      canBrowse: false,
      guidedExport: true,
    },
  ];
}

export function getImportProviderInfo(
  provider: MediaImportProvider,
): MediaImportProviderInfo | undefined {
  return listImportProviderInfo().find((p) => p.id === provider);
}

export function isOAuthImportProvider(
  value: string,
): value is OAuthMediaImportProvider {
  return (
    value === "google_drive" ||
    value === "dropbox" ||
    value === "facebook" ||
    value === "instagram" ||
    value === "tiktok"
  );
}
