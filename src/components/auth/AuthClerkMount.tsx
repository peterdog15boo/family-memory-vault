"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AuthCardSkeleton } from "@/components/auth/AuthCardSkeleton";

/**
 * Shows an intentional skeleton until the client mounts Clerk widgets,
 * so the glass card never looks blank or broken.
 */
export function AuthClerkMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <AuthCardSkeleton />;
  }

  return <div className="auth-clerk-mount">{children}</div>;
}
