"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

type DashboardUserMenuProps = {
  displayName: string;
  email?: string | null;
};

export function DashboardUserMenu({
  displayName,
  email,
}: DashboardUserMenuProps) {
  return (
    <div className="dashboard-user-menu flex items-center gap-3">
      <div className="dashboard-user-menu-meta min-w-0 text-right">
        <p className="truncate text-sm font-medium text-ink">{displayName}</p>
        {email ? (
          <p className="truncate text-xs text-ink-muted">{email}</p>
        ) : null}
      </div>
      <SignOutButton redirectUrl="/">
        <button
          type="button"
          className="dashboard-sign-out inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-2 text-sm text-ink-muted transition-colors hover:border-ink/20 hover:text-ink"
        >
          <LogOut className="size-3.5" aria-hidden />
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
