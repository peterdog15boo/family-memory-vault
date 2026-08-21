/**
 * Media import providers — device upload plus official cloud/social OAuth.
 * Never scrape; unavailable providers expose honest status for the UI.
 */

export const MEDIA_IMPORT_PROVIDERS = [
  "device",
  "export_package",
  "google_takeout",
  "dropbox",
  "google_drive",
  "facebook",
  "instagram",
  "tiktok",
] as const;

export type MediaImportProvider = (typeof MEDIA_IMPORT_PROVIDERS)[number];

export const OAUTH_MEDIA_IMPORT_PROVIDERS = [
  "google_drive",
  "dropbox",
  "facebook",
  "instagram",
  "tiktok",
] as const;

export type OAuthMediaImportProvider =
  (typeof OAUTH_MEDIA_IMPORT_PROVIDERS)[number];

export type MediaImportAvailability =
  | "ready"
  | "needs_config"
  | "limited"
  | "unavailable"
  | "pending_authorization";

export type MediaImportSection =
  | "device"
  | "export_package"
  | "cloud"
  | "direct_social";

export type MediaImportProviderInfo = {
  id: MediaImportProvider;
  label: string;
  description: string;
  availability: MediaImportAvailability;
  section: MediaImportSection;
  /** Priority within the Import center (lower = higher). */
  priority: number;
  /** Shown before OAuth / connect. */
  permissionNote: string;
  /** Extra honesty for limited/unavailable providers. */
  limitationNote?: string;
  /** Whether OAuth connect is offered (even if media list is limited). */
  canConnect: boolean;
  /** Whether picking files from the API is supported today. */
  canBrowse: boolean;
  /** Guided export → zip/device upload instead of API import. */
  guidedExport?: boolean;
  /** Accepts .zip Takeout / social data packages. */
  acceptsExportZip?: boolean;
};

export type MediaConnectionPublic = {
  id: string;
  provider: OAuthMediaImportProvider;
  accountLabel: string | null;
  externalAccountId: string | null;
  status: "active" | "error" | "disconnected";
  connectedAt: string;
  lastError: string | null;
};
