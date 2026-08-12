"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, EyeOff, Lock } from "lucide-react";
import { GrantedLegacyVideos } from "@/components/legacy/GrantedLegacyVideos";
import { useCopy } from "@/components/i18n/LocaleProvider";
import type { LoadedLegacyVault } from "@/lib/legacy/load-vault";
import type { SerializedLegacySecureItem } from "@/lib/legacy/serialize";
import {
  LEGACY_CONTACT_CATEGORY_LABELS,
  LEGACY_INSTRUCTION_SECTION_LABELS,
  LEGACY_SECURE_ITEM_TYPE_LABELS,
} from "@/lib/legacy/types";

type GrantedLegacyViewProps = {
  ownerUserId: string;
  ownerDisplayName: string | null;
  vault: LoadedLegacyVault;
  grantExpiresAt: string | null;
  accessType: "temporary" | "permanent";
};

export function GrantedLegacyView({
  ownerUserId,
  ownerDisplayName,
  vault,
  grantExpiresAt,
  accessType,
}: GrantedLegacyViewProps) {
  const copy = useCopy();
  const ownerLabel = ownerDisplayName?.trim() || "Vault owner";
  const [revealedById, setRevealedById] = useState<
    Record<string, SerializedLegacySecureItem>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secureError, setSecureError] = useState<string | null>(null);

  async function revealGrantedItem(item: SerializedLegacySecureItem) {
    if (revealedById[item.id]) {
      setRevealedById((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    if (!window.confirm(copy.legacy.secureRevealConfirm)) return;

    setBusyId(item.id);
    setSecureError(null);
    try {
      const res = await fetch(
        `/api/legacy/granted/${ownerUserId}/secure-items/${item.id}/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: true }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not reveal this item.");
      }
      setRevealedById((prev) => ({
        ...prev,
        [item.id]: data.secureItem,
      }));
    } catch (err) {
      setSecureError(
        err instanceof Error ? err.message : "Could not reveal this item.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="legacy-vault documents-vault mx-auto max-w-3xl">
      <header className="legacy-vault-in">
        <Link
          href="/emergency-access"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--legacy-muted)] hover:text-[color:var(--legacy-accent-deep)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Emergency Access
        </Link>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--legacy-muted)]">
          <Lock className="size-3.5" aria-hidden />
          Emergency grant · read-only
        </p>
        <h1 className="page-title mt-2 font-display text-3xl tracking-tight text-[color:var(--legacy-ink)]">
          {ownerLabel}&apos;s Digital Legacy
        </h1>
        {accessType === "permanent" ? (
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Permanent access is active until the owner revokes it. Treat this
            information with care and respect.
          </p>
        ) : grantExpiresAt ? (
          <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
            Temporary access is active. Treat this information with care and
            respect.
          </p>
        ) : null}
        <div className="mt-4">
          <a
            href={`/api/legacy/granted/${ownerUserId}/packet`}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3.5 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            <Download className="size-4" aria-hidden />
            Export emergency packet
          </a>
        </div>
      </header>

      <div className="legacy-vault-in mt-8 space-y-6">
        {(vault.profile.summaryMessage ||
          vault.profile.generalInstructions ||
          vault.profile.funeralPreferences) && (
          <section className="legacy-vault-panel documents-vault-panel rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
              Message to loved ones
            </h2>
            {vault.profile.summaryMessage ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-ink)]">
                {vault.profile.summaryMessage}
              </p>
            ) : null}
            {vault.profile.generalInstructions ? (
              <>
                <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
                  Additional instructions
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-ink)]">
                  {vault.profile.generalInstructions}
                </p>
              </>
            ) : null}
            {vault.profile.funeralPreferences ? (
              <>
                <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
                  Memorial preferences
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-ink)]">
                  {vault.profile.funeralPreferences}
                </p>
              </>
            ) : null}
          </section>
        )}

        {vault.contacts.length ? (
          <section className="legacy-vault-panel documents-vault-panel rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
              Key contacts
            </h2>
            <ul className="mt-4 space-y-3">
              {vault.contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3 text-sm"
                >
                  <p className="font-medium text-[color:var(--legacy-ink)]">
                    {c.name}
                    {c.isPrimary ? " · Primary" : ""}
                  </p>
                  <p className="text-[color:var(--legacy-muted)]">
                    {LEGACY_CONTACT_CATEGORY_LABELS[c.category]}
                    {c.relationship ? ` · ${c.relationship}` : ""}
                  </p>
                  {c.phone ? <p>{c.phone}</p> : null}
                  {c.email ? <p>{c.email}</p> : null}
                  {c.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-[color:var(--legacy-muted)]">
                      {c.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {vault.instructions.length ? (
          <section className="legacy-vault-panel documents-vault-panel rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
              Instructions
            </h2>
            <ul className="mt-4 space-y-3">
              {vault.instructions.map((i) => (
                <li
                  key={i.id}
                  className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
                    {LEGACY_INSTRUCTION_SECTION_LABELS[i.sectionType]}
                  </p>
                  <p className="mt-1 font-medium text-[color:var(--legacy-ink)]">
                    {i.title}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                    {i.content}
                  </p>
                  {i.attachedDocuments.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {i.attachedDocuments.map((document) => (
                        <span
                          key={document.id}
                          className="rounded-full border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1 text-xs text-[color:var(--legacy-muted)]"
                        >
                          Attached document: {document.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <GrantedLegacyVideos
          ownerUserId={ownerUserId}
          videos={vault.videos}
        />

        {vault.secureItems.length ? (
          <section className="legacy-vault-panel documents-vault-panel rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
              Secure items
            </h2>
            <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
              Handle sensitive information responsibly. Content stays hidden until
              you reveal it — each reveal is logged.
            </p>
            {secureError ? (
              <p className="mt-3 text-sm text-red-800" role="alert">
                {secureError}
              </p>
            ) : null}
            <ul className="mt-4 space-y-3">
              {vault.secureItems.map((item) => {
                const revealed = revealedById[item.id];
                return (
                <li
                  key={item.id}
                  className="rounded-xl border border-amber-800/20 bg-amber-50/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[color:var(--legacy-ink)]">
                        {item.label}
                      </p>
                      <p className="text-xs text-[color:var(--legacy-muted)]">
                        {LEGACY_SECURE_ITEM_TYPE_LABELS[item.itemType]}
                      </p>
                      <div className="mt-2">
                        {revealed?.content ? (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-ink)]">
                            {revealed.content}
                          </p>
                        ) : (
                          <p className="flex items-center gap-2 text-sm text-[color:var(--legacy-muted)]">
                            <EyeOff className="size-4" aria-hidden />
                            Sensitive content hidden
                          </p>
                        )}
                      </div>
                      {item.relatedDocumentTitle ? (
                        <p className="mt-2 text-xs text-[color:var(--legacy-muted)]">
                          Related document: {item.relatedDocumentTitle}
                        </p>
                      ) : null}
                      {revealed?.notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--legacy-muted)]">
                          {revealed.notes}
                        </p>
                      ) : item.notesRedacted ? (
                        <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                          Additional notes hidden
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => revealGrantedItem(item)}
                      disabled={busyId === item.id}
                      className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                    >
                      {revealed ? "Hide" : "Reveal"}
                    </button>
                  </div>
                </li>
              );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
