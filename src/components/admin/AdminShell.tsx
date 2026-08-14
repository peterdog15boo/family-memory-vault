"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { IdleSessionGuard } from "@/components/session/IdleSessionGuard";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  children: React.ReactNode;
  displayName?: string;
};

export function AdminShell({ children, displayName }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-canvas-deep/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <Link
              href="/admin"
              className="font-display text-xl tracking-tight text-ink hover:opacity-80"
            >
              Admin
            </Link>
            <span className="hidden text-xs text-ink-muted sm:inline">
              Internal tools · Family Memory Vault
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <FeedbackButton collapseLabel={false} placement="header" />
            {displayName ? (
              <span className="text-ink-muted">{displayName}</span>
            ) : null}
            <Link
              href="/dashboard"
              className="text-accent-deep hover:underline"
            >
              ← Back to app
            </Link>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6"
          aria-label="Admin tools"
        >
          {ADMIN_NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/15 font-medium text-accent-deep"
                    : "text-ink-muted hover:bg-ink/5 hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <IdleSessionGuard />
    </div>
  );
}
