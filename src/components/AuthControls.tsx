"use client";

import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthControlsProps = {
  className?: string;
};

export function AuthControls({ className }: AuthControlsProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Show when="signed-out">
        <SignInButton mode="modal" forceRedirectUrl="/dashboard">
          <button
            type="button"
            className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-deep"
          >
            <Shield className="size-3.5" aria-hidden />
            Get started
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link
          href="/dashboard"
          className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:inline"
        >
          Dashboard
        </Link>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </Show>
    </div>
  );
}
