"use client";

import { Scale } from "lucide-react";

type EmergencyAccessLegalNoticeProps = {
  compact?: boolean;
};

export function EmergencyAccessLegalNotice({
  compact = false,
}: EmergencyAccessLegalNoticeProps) {
  return (
    <div
      className="flex gap-3 rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)]/70 px-4 py-4 text-sm leading-relaxed text-[color:var(--legacy-muted)]"
      role="note"
    >
      <Scale
        className="mt-0.5 size-5 shrink-0 text-[color:var(--legacy-accent)]"
        aria-hidden
      />
      <div>
        <p className="font-medium text-[color:var(--legacy-ink)]">
          Not legal advice
        </p>
        {compact ? (
          <p className="mt-1">
            Emergency access is a practical tool inside this app. Real-world
            estate planning may require an attorney, formal documents, and
            provider-specific account recovery.
          </p>
        ) : (
          <>
            <p className="mt-1">
              This feature helps someone you trust read the guidance you left in
              Digital Legacy. It does not replace wills, trusts, executor
              appointments, powers of attorney, or court-directed access.
            </p>
            <p className="mt-2">
              Laws vary by location. Consider speaking with a qualified estate
              planning attorney before relying on app-based access for important
              decisions.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
