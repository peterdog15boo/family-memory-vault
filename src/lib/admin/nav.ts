/**
 * Shared admin navigation / tool catalog.
 * Used by AdminShell and the /admin overview page.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Film,
  LayoutDashboard,
  Package,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Match pathname exactly (for /admin overview). */
  exact?: boolean;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    description: "Snapshot and links to every admin tool.",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Search accounts, change plans, suspend, grant admin.",
    icon: Users,
  },
  {
    href: "/admin/memory-box",
    label: "Memory Box",
    description: "Digitizing intake requests and status tracking.",
    icon: Package,
  },
  {
    href: "/admin/safety",
    label: "Safety",
    description: "Moderation counts, quarantines, NCMEC, metadata inspect.",
    icon: Shield,
  },
  {
    href: "/admin/review",
    label: "Review",
    description: "Human review queue for borderline media.",
    icon: ClipboardCheck,
  },
  {
    href: "/admin/movies",
    label: "Movies",
    description: "Movie generation snapshot and success rates.",
    icon: Film,
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    description: "Users, storage, uploads, and moderation mix.",
    icon: BarChart3,
  },
  {
    href: "/admin/ops",
    label: "Ops",
    description: "Queue health, failed jobs, and retries.",
    icon: Activity,
  },
  {
    href: "/admin/audit",
    label: "Audit",
    description: "Log of important admin actions.",
    icon: ScrollText,
  },
] as const;

/** Tools shown on the overview grid (excludes Overview itself). */
export const ADMIN_TOOLS = ADMIN_NAV.filter((item) => item.href !== "/admin");
