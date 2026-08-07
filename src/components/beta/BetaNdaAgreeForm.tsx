"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BETA_NDA_CLOSING,
  BETA_NDA_INTRO,
  BETA_NDA_SECTIONS,
  BETA_NDA_TITLE,
} from "@/lib/beta-nda/nda-text";
import { BETA_NDA_VERSION } from "@/lib/beta-nda/constants";
import { cn } from "@/lib/utils";

type Props = {
  initialFullName: string;
  initialEmail: string;
  redirectTo: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function BetaNdaAgreeForm({
  initialFullName,
  initialEmail,
  redirectTo,
}: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [email, setEmail] = useState(initialEmail);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = useMemo(() => {
    return (
      agreed &&
      fullName.trim().length > 0 &&
      isValidEmail(email) &&
      !pending
    );
  }, [agreed, fullName, email, pending]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/beta-nda/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            agreed: true,
            redirectTo,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          redirectTo?: string;
        };
        if (!res.ok) {
          setError(data.error || "Could not save your agreement.");
          return;
        }
        router.replace(data.redirectTo || redirectTo || "/dashboard");
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div className="beta-nda-page">
      <header className="beta-nda-header">
        <p className="beta-nda-eyebrow">Private beta</p>
        <h1 className="beta-nda-title">Beta Tester Agreement</h1>
        <p className="beta-nda-lead">
          Please review and accept the Non-Disclosure Agreement before
          continuing into Family Memory Vault.
        </p>
        <p className="beta-nda-version">Document version: {BETA_NDA_VERSION}</p>
      </header>

      <article className="beta-nda-scroll" aria-label="Beta Tester NDA">
        <h2 className="beta-nda-doc-title">{BETA_NDA_TITLE}</h2>
        {BETA_NDA_INTRO.map((p) => (
          <p key={p.slice(0, 48)} className="beta-nda-p">
            {p}
          </p>
        ))}
        {BETA_NDA_SECTIONS.map((section) => (
          <section key={section.heading} className="beta-nda-section">
            <h3 className="beta-nda-h">{section.heading}</h3>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 48)} className="beta-nda-p">
                {p}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="beta-nda-list">
                {section.bullets.map((item) => (
                  <li key={item.slice(0, 48)}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.afterBullets?.map((p) => (
              <p key={p.slice(0, 48)} className="beta-nda-p">
                {p}
              </p>
            ))}
          </section>
        ))}
        <p className="beta-nda-p beta-nda-closing">{BETA_NDA_CLOSING}</p>
      </article>

      <form className="beta-nda-form" onSubmit={onSubmit} noValidate>
        <label className="beta-nda-field">
          <span>Full Name</span>
          <input
            className="ui-input beta-nda-input"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label className="beta-nda-field">
          <span>Email address</span>
          <input
            className="ui-input beta-nda-input"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={pending}
          />
        </label>

        <label
          className={cn("beta-nda-check", !agreed && error ? "is-error" : null)}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={pending}
          />
          <span>
            I have read and agree to the Beta Tester Non-Disclosure Agreement
          </span>
        </label>

        {error ? (
          <p className="beta-nda-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="ui-btn ui-btn-primary beta-nda-submit"
          disabled={!canSubmit}
        >
          {pending ? "Saving…" : "I Agree – Continue to Beta"}
        </button>
      </form>
    </div>
  );
}
