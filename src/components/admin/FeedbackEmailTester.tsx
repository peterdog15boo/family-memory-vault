"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, Send } from "lucide-react";
import {
  buildFeedbackReplyDraft,
  type FeedbackReplyReport,
} from "@/lib/admin/feedback-reply";
import type { FeedbackMode } from "@/lib/feedback/categories";
import { cn } from "@/lib/utils";

type FeedbackEmailTesterProps = {
  feedbackId: string;
  ticketId: string;
  mode: FeedbackMode;
  email: string | null;
  testerName?: string | null;
  report: FeedbackReplyReport;
  /** Server hint — Resend key present. */
  emailConfigured?: boolean;
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function FeedbackEmailTester({
  feedbackId,
  ticketId,
  mode,
  email,
  testerName,
  report,
  emailConfigured = true,
}: FeedbackEmailTesterProps) {
  const router = useRouter();
  const titleId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<"email" | "message" | null>(null);

  const hasEmail = Boolean(email?.trim());

  function makeDraft() {
    return buildFeedbackReplyDraft({
      mode,
      testerName,
      report,
    });
  }

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  function openCompose() {
    setError(null);
    setStatus(null);
    const draft = makeDraft();
    setSubject(draft.subject);
    setBody(draft.body);
    setOpen(true);
  }

  function handleCopyEmail() {
    if (!email?.trim()) return;
    void copyText(email.trim()).then((ok) => {
      setCopied(ok ? "email" : null);
      setStatus(ok ? "Email copied" : null);
      setError(ok ? null : "Could not copy email");
    });
  }

  function handleCopyMessage() {
    const draft = open
      ? { subject: subject.trim(), body: body.trim() }
      : makeDraft();
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    void copyText(text).then((ok) => {
      setCopied(ok ? "message" : null);
      setStatus(ok ? "Full draft copied" : null);
      setError(ok ? null : "Could not copy message");
    });
  }

  function handleSend() {
    if (!hasEmail) return;
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/feedback/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: feedbackId,
            subject: subject.trim(),
            body: body.trim(),
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          logged?: boolean;
          to?: string;
        };
        if (!response.ok) {
          setError(data.error || "Could not send email");
          return;
        }
        setStatus(
          data.logged
            ? `Reply logged (email not configured) to ${data.to ?? "tester"}`
            : `Reply sent to ${data.to ?? "tester"}`,
        );
        setOpen(false);
        router.refresh();
      } catch {
        setError("Could not send email");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-ink/10 bg-canvas px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Email tester
        </p>
        {!emailConfigured ? (
          <span className="text-[10px] text-ink-muted">
            Resend off — copy works; Send logs only
          </span>
        ) : null}
      </div>

      {!hasEmail ? (
        <p className="text-xs text-ink-muted">
          No reporter email on this ticket.
        </p>
      ) : (
        <p
          className="truncate font-mono text-xs text-ink"
          title={email ?? undefined}
        >
          {email}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !text-xs"
          onClick={openCompose}
          disabled={!hasEmail || pending}
        >
          <Mail className="size-3.5" aria-hidden />
          Email tester
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !text-xs"
          onClick={handleCopyEmail}
          disabled={!hasEmail}
        >
          {copied === "email" ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied === "email" ? "Email copied" : "Copy email"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !text-xs"
          onClick={handleCopyMessage}
        >
          {copied === "message" ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied === "message" ? "Draft copied" : "Copy full draft"}
        </button>
      </div>

      {open ? (
        <div
          className="mt-2 space-y-2.5 border-t border-ink/8 pt-3"
          role="region"
          aria-labelledby={titleId}
        >
          <p id={titleId} className="text-xs font-medium text-ink">
            Compose reply · {ticketId}
          </p>
          <p className="text-[11px] text-ink-muted">
            Full {mode === "feature" ? "feature" : "bug"} acknowledgment with
            quoted report and signature. Edit freely before sending.
          </p>

          <div>
            <label
              htmlFor={subjectId}
              className="text-[11px] font-medium text-ink-muted"
            >
              Subject
            </label>
            <input
              id={subjectId}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div>
            <label
              htmlFor={bodyId}
              className="text-[11px] font-medium text-ink-muted"
            >
              Message
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "ui-btn ui-btn-primary inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !text-xs",
              )}
              onClick={handleSend}
              disabled={pending || !hasEmail || !subject.trim() || !body.trim()}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}
              Send reply
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-secondary !px-2.5 !py-1.5 !text-xs"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[11px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {status && !error ? (
        <p className="text-[11px] text-ink-muted" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
