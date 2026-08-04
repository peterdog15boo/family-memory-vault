"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";

export function SuspendedActions() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <SignOutButton>
        <button
          type="button"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          Sign out
        </button>
      </SignOutButton>
      <Link
        href="/"
        className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
      >
        Home
      </Link>
    </div>
  );
}
