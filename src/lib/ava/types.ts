/**
 * Ava — guided new-user helper types (client-safe).
 */

export type AvaStepId =
  | "welcome"
  | "screen_name"
  | "avatar"
  | "upload"
  | "moderation"
  | "photos_ready"
  | "encourage_memory"
  | "create_memory"
  | "people"
  | "create_movie"
  | "ask_ai"
  | "invite"
  | "documents_legacy"
  | "will_planner"
  | "complete";

export type AvaStepStatus = "locked" | "available" | "active" | "done";

export type AvaStep = {
  id: AvaStepId;
  title: string;
  description: string;
  href: string | null;
  ctaLabel: string | null;
  optional: boolean;
  status: AvaStepStatus;
  /** When true, Ava renders an inline form instead of a link. */
  inline?: "screen_name" | "avatar" | "acknowledge";
  /** Friendly example prompts (e.g. Ask AI). */
  examples?: string[];
  /** Upgrade note when pointing at Legacy+-only features. */
  upgradeNote?: string | null;
};

export type AvaSignals = {
  mediaCount: number;
  pendingModerationCount: number;
  cleanPhotoCount: number;
  /**
   * Clean + ready library photos and videos (usable for movie creation).
   * Ava’s create-movie tip stays locked until this is ≥ 5.
   */
  cleanUsableMediaCount: number;
  memoryCount: number;
  peopleCount: number;
  movieCount: number;
  inviteCount: number;
  assistantConversationCount: number;
  displayName: string | null;
  imageUrl: string | null;
  /** Most recent Memory id (for movie create deep link). */
  latestMemoryId: string | null;
  /** Active Will Planner draft exists (owner-only). */
  hasActiveWillDraft: boolean;
};

export type AvaAutoOpenReason =
  | "welcome"
  | "identity_setup"
  | "identity_idle"
  | "photos_ready"
  | "encourage_memory"
  | "memory_celebrate"
  | "invite_after_movie"
  | "retention_tip";

export type AvaRetentionTip = {
  id: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  upgradeNote?: string | null;
};

export type AvaProgress = {
  /**
   * Auto-open the helper popup for this response (first-run or quiet milestone).
   * Not a “journey is active” flag — clients must not reopen on every navigation.
   */
  showPanel: boolean;
  /** Why auto-open was requested; null when the client should stay quiet. */
  autoOpenReason: AvaAutoOpenReason | null;
  /**
   * Client should poll for progress (upload received, waiting on quick check,
   * or photos-ready celebration pending).
   */
  pollWhileWaiting: boolean;
  /** @deprecated Prefer showHeaderIcon — kept for older clients. */
  showResumeChip: boolean;
  /** Header Ava icon after onboarding has started. */
  showHeaderIcon: boolean;
  /** Subtle badge on the header icon when a next step is waiting. */
  hasRecommendedAction: boolean;
  /**
   * Welcome / screen name / avatar still incomplete — client may idle-reprompt.
   */
  identityIncomplete: boolean;
  /** Eligible for Ava at all (new users). */
  eligible: boolean;
  helperEnabled: boolean;
  dismissed: boolean;
  completed: boolean;
  screenName: string | null;
  avatarMediaId: string | null;
  avatarUrl: string | null;
  /** Resolved preview for the user's chosen avatar (optional). */
  avatarPreviewUrl: string | null;
  activeStepId: AvaStepId | null;
  steps: AvaStep[];
  /** Visible steps only (not locked). */
  visibleSteps: AvaStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
  signals: AvaSignals;
  /** Soft retention: user looks dormant (no recent meaningful vault action). */
  dormant: boolean;
  /** Soft tip for dormant users — never stacks over identity / welcome. */
  retentionTip: AvaRetentionTip | null;
  /** Client may idle-open this tip (24h + session caps still apply client-side). */
  retentionCanAutoOpen: boolean;
};
