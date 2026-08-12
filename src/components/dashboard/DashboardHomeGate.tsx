"use client";

import { useLayoutEffect, useState } from "react";
import {
  DashboardHomeModern,
  DashboardHomeOriginal,
} from "@/components/dashboard/DashboardHome";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { AccountUsageSummary } from "@/lib/billing/account-usage";
import type { MediaReviewSummary, SafeMediaItem } from "@/lib/media/queries";
import type { MemoryListItem } from "@/lib/memories";
import type { OnboardingProgress } from "@/lib/onboarding/types";
import type { JourneyBoardSnapshot } from "@/lib/gamification/journey-board";
import {
  APP_THEME_DEFAULT,
  isAppTheme,
  type AppTheme,
} from "@/lib/theme/types";

type DashboardHomeProps = {
  displayName: string;
  mediaOwn: SafeMediaItem[];
  mediaShared: SafeMediaItem[];
  hasFamilyMedia: boolean;
  memoriesOwn: MemoryListItem[];
  memoriesShared: MemoryListItem[];
  hasFamilyMemories: boolean;
  reviewSummary: MediaReviewSummary;
  usage: AccountUsageSummary;
  onboarding: OnboardingProgress;
  stripeConfigured: boolean;
  journeyBoard: JourneyBoardSnapshot;
};

/**
 * Theme fork for the authenticated home. Modern is gallery-first;
 * Original keeps the denser vault overview.
 */
export function DashboardHome(props: DashboardHomeProps) {
  const { theme, ready } = useTheme();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready
    ? theme
    : (domTheme ?? APP_THEME_DEFAULT);

  if (effective === "modern") {
    return <DashboardHomeModern {...props} />;
  }

  const { displayName: _displayName, ...originalProps } = props;
  void _displayName;
  return <DashboardHomeOriginal {...originalProps} />;
}
