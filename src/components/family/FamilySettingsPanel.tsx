"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Copy,
  Loader2,
  LogOut,
  Mail,
  Shield,
  UserMinus,
  Users,
} from "lucide-react";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { celebrateFromJourney } from "@/lib/celebrations/bus";
import { FamilyCircleStrength } from "@/components/family/FamilyCircleStrength";
import { FamilyLocationMap } from "@/components/family/FamilyLocationMap";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";
import { useCopy, useFormat, useTranslations } from "@/components/i18n/LocaleProvider";
import type { TranslateFn } from "@/lib/i18n";
import type {
  SerializedFamily,
  SerializedFamilyMember,
  SerializedFamilyWithMembership,
} from "@/lib/families/serialize";
import type { FamilyLocationsPayload } from "@/lib/location/types";
import { INVITABLE_FAMILY_ROLES } from "@/lib/families/types";
import { userFacingApiError } from "@/lib/http/user-messages";
import type { PlanCapabilities } from "@/lib/plans/gates";
import { cn } from "@/lib/utils";

type FamilySettingsPanelProps = {
  viewerUserId: string;
  families: SerializedFamilyWithMembership[];
  membersByFamilyId: Record<string, SerializedFamilyMember[]>;
  locationsByFamilyId: Record<string, FamilyLocationsPayload>;
  capabilities: PlanCapabilities;
};

function roleLabel(t: TranslateFn, role: string) {
  if (role === "owner") return t("family.roleOwner");
  if (role === "member") return t("family.roleMember");
  if (role === "viewer") return t("family.roleViewer");
  return role;
}

export function FamilySettingsPanel({
  viewerUserId,
  families: initialFamilies,
  membersByFamilyId: initialMembers,
  locationsByFamilyId: initialLocations,
  capabilities,
}: FamilySettingsPanelProps) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const [families, setFamilies] = useState(initialFamilies);
  const [membersByFamilyId, setMembersByFamilyId] = useState(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setFamilies(initialFamilies);
    setMembersByFamilyId(initialMembers);
  }, [initialFamilies, initialMembers]);

  const primary = families[0] ?? null;

  function refresh() {
    router.refresh();
  }

  function runAction(key: string, action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusyKey(key);
    startTransition(async () => {
      try {
        await action();
        refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("family.errorGeneric"),
        );
      } finally {
        setBusyKey(null);
      }
    });
  }

  if (families.length === 0) {
    if (!capabilities.familySharing) {
      return (
        <div className="family-panel ui-empty rounded-2xl border border-ink/10 bg-gradient-to-b from-canvas to-canvas-deep/40 px-6 py-10">
          <span className="ui-empty-icon mx-auto inline-flex">
            <Users className="size-9 text-accent/70" aria-hidden />
          </span>
          <h2 className="ui-empty-title mt-4 text-center font-display text-2xl tracking-tight text-ink">
            {t("family.familySharingTitle")}
          </h2>
          <p className="ui-empty-copy mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-ink-muted">
            {t("family.familySharingBody")}
          </p>
          <div className="mx-auto mt-6 max-w-md">
            <UpgradePrompt
              title={t("family.upgradeNotOnPlan")}
              message={t("family.upgradeOnPlanMessage", {
                plan: capabilities.planName,
              })}
              hint={t("family.upgradeFamilyHint")}
            />
          </div>
        </div>
      );
    }

    return (
      <CreateFamilyCard
        pending={pending && busyKey === "create"}
        error={error}
        onCreate={(name) =>
          runAction("create", async () => {
            const response = await fetch("/api/family", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            const data = (await response.json().catch(() => ({}))) as {
              error?: string;
              family?: SerializedFamily;
              code?: string;
            };
            if (!response.ok) {
              throw new Error(data.error || t("family.errorCreate"));
            }
            setNotice(t("family.createdInviteBelow"));
          })
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent-deep"
        >
          {notice}
        </p>
      ) : null}
      {families.map((family) => {
        const members = membersByFamilyId[family.id] ?? [];
        const isOwner = family.membership.role === "owner";
        const active = members.filter((m) => m.status === "active");
        const pendingInvites = members.filter((m) => m.status === "pending");
        const seatCount = active.length + pendingInvites.length;
        const atMemberLimit =
          capabilities.familySharing &&
          seatCount >= capabilities.maxFamilyMembers;
        const canInvite =
          isOwner && capabilities.familySharing && !atMemberLimit;

        return (
          <section
            key={family.id}
            className="family-panel list-panel rounded-2xl border border-ink/10 bg-canvas/80 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl tracking-tight text-ink">
                    {family.name}
                  </h2>
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-deep">
                    {roleLabel(t, family.membership.role)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {active.length === 1
                    ? t("family.activeMembers", { count: active.length })
                    : t("family.activeMembersPlural", { count: active.length })}
                  {pendingInvites.length > 0
                    ? pendingInvites.length === 1
                      ? t("family.pendingInvitesSuffix", {
                          count: pendingInvites.length,
                        })
                      : t("family.pendingInvitesSuffixPlural", {
                          count: pendingInvites.length,
                        })
                    : ""}
                  {isOwner
                    ? t("family.seatsUsedSuffix", {
                        used: seatCount,
                        max: capabilities.maxFamilyMembers,
                      })
                    : ""}
                </p>
              </div>

              {!isOwner ? (
                <button
                  type="button"
                  disabled={pending && busyKey === `leave-${family.id}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        t("family.leaveConfirm", { name: family.name }),
                      )
                    ) {
                      return;
                    }
                    runAction(`leave-${family.id}`, async () => {
                      const response = await fetch(
                        `/api/family/${family.id}/leave`,
                        { method: "POST" },
                      );
                      const data = (await response.json().catch(() => ({}))) as {
                        error?: string;
                      };
                      if (!response.ok) {
                        throw new Error(data.error || t("family.errorLeave"));
                      }
                      setFamilies((prev) =>
                        prev.filter((f) => f.id !== family.id),
                      );
                      setNotice(t("family.leftNotice"));
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-red-300 hover:bg-red-50 hover:text-red-800 disabled:opacity-60"
                >
                  {pending && busyKey === `leave-${family.id}` ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <LogOut className="size-3.5" aria-hidden />
                  )}
                  {t("family.leaveFamily")}
                </button>
              ) : null}
            </div>

            <FamilyCircleStrength members={members} className="mt-5" />

            <FamilyLocationMap
              familyId={family.id}
              viewerUserId={viewerUserId}
              initialLocations={initialLocations[family.id]?.locations ?? []}
              initialViewerDistanceEnabled={
                initialLocations[family.id]?.viewerDistanceEnabled ?? false
              }
              className="mt-8"
            />

            {isOwner ? (
              canInvite ? (
                <InviteForm
                  familyId={family.id}
                  disabled={pending}
                  busy={busyKey === `invite-${family.id}`}
                  onInvite={(payload) =>
                    runAction(`invite-${family.id}`, async () => {
                      const response = await fetch("/api/family/invite", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      const data = (await response.json().catch(() => ({}))) as {
                        error?: string;
                        code?: string;
                        member?: SerializedFamilyMember;
                        inviteLink?: string;
                        emailSent?: boolean;
                        celebration?: JourneyCelebrationPayload | null;
                      };
                      if (data.member) {
                        setMembersByFamilyId((prev) => {
                          const list = prev[family.id] ?? [];
                          const without = list.filter(
                            (m) =>
                              m.id !== data.member!.id &&
                              m.invitedEmail !== data.member!.invitedEmail,
                          );
                          return {
                            ...prev,
                            [family.id]: [data.member!, ...without],
                          };
                        });
                        if (data.inviteLink) {
                          setInviteLinks((prev) => ({
                            ...prev,
                            [data.member!.id]: data.inviteLink!,
                          }));
                        }
                      }
                      if (!response.ok) {
                        throw new Error(
                          userFacingApiError(
                            data,
                            t("family.errorSendInvite"),
                          ),
                        );
                      }
                      setNotice(
                        t("family.inviteSentTo", { email: payload.email }),
                      );
                      if (data.celebration) {
                        celebrateFromJourney(data.celebration);
                        window.dispatchEvent(new Event("fmv-journey-check"));
                        window.dispatchEvent(new Event("fmv-journey-refresh"));
                      }
                    })
                  }
                />
              ) : (
                <div className="mt-6">
                  <UpgradePrompt
                    title={
                      !capabilities.familySharing
                        ? t("family.invitesRequireFamily")
                        : t("family.familyIsFull")
                    }
                    message={
                      !capabilities.familySharing
                        ? t("family.planNoInvites", {
                            plan: capabilities.planName,
                          })
                        : t("family.seatsUsedMessage", {
                            used: seatCount,
                            max: capabilities.maxFamilyMembers,
                          })
                    }
                    hint={
                      !capabilities.familySharing
                        ? t("family.upgradeInviteHint")
                        : t("family.upgradeSeatsHint")
                    }
                  />
                </div>
              )
            ) : (
              <p className="mt-5 flex gap-2 rounded-md bg-canvas-deep/60 px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
                <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                {t("family.onlyOwnersCanInvite")}
              </p>
            )}

            {pendingInvites.length > 0 ? (
              <div className="mt-8">
                <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Clock className="size-4 text-amber-700" aria-hidden />
                  {t("family.pendingInvitations")}
                </h3>
                <ul className="mt-3 divide-y divide-ink/8 rounded-xl border border-amber-200/80 bg-amber-50/50">
                  {pendingInvites.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewerUserId={viewerUserId}
                      isOwner={isOwner}
                      pending={pending}
                      busyKey={busyKey}
                      inviteLink={inviteLinks[member.id]}
                      onChangeRole={(role) =>
                        runAction(`role-${member.id}`, async () => {
                          const response = await fetch(
                            `/api/family/${family.id}/members/${member.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role }),
                            },
                          );
                          const data = (await response
                            .json()
                            .catch(() => ({}))) as {
                            error?: string;
                            member?: SerializedFamilyMember;
                          };
                          if (!response.ok) {
                            throw new Error(
                              data.error || t("family.errorUpdateRole"),
                            );
                          }
                          if (data.member) {
                            setMembersByFamilyId((prev) => ({
                              ...prev,
                              [family.id]: (prev[family.id] ?? []).map((m) =>
                                m.id === member.id ? { ...m, ...data.member! } : m,
                              ),
                            }));
                          }
                        })
                      }
                      onRemove={() =>
                        runAction(`remove-${member.id}`, async () => {
                          const response = await fetch(
                            `/api/family/${family.id}/members/${member.id}`,
                            { method: "DELETE" },
                          );
                          const data = (await response
                            .json()
                            .catch(() => ({}))) as { error?: string };
                          if (!response.ok) {
                            throw new Error(
                              data.error || t("family.errorCancelInvite"),
                            );
                          }
                          setMembersByFamilyId((prev) => ({
                            ...prev,
                            [family.id]: (prev[family.id] ?? []).filter(
                              (m) => m.id !== member.id,
                            ),
                          }));
                          setInviteLinks((prev) => {
                            const next = { ...prev };
                            delete next[member.id];
                            return next;
                          });
                          setNotice(t("family.invitationCanceled"));
                        })
                      }
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-8">
              <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                <Users className="size-4 text-accent-deep" aria-hidden />
                {t("family.members")}
              </h3>
              <ul className="family-list mt-3 divide-y divide-ink/8 rounded-xl border border-ink/10 bg-canvas">
                {active.length === 0 ? (
                  <li className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-ink">
                      {copy.empty.familyMembers.title}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                      {copy.empty.familyMembers.description}
                    </p>
                  </li>
                ) : (
                  active.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewerUserId={viewerUserId}
                      isOwner={isOwner}
                      pending={pending}
                      busyKey={busyKey}
                      onChangeRole={(role) =>
                        runAction(`role-${member.id}`, async () => {
                          const response = await fetch(
                            `/api/family/${family.id}/members/${member.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role }),
                            },
                          );
                          const data = (await response
                            .json()
                            .catch(() => ({}))) as {
                            error?: string;
                            member?: SerializedFamilyMember;
                          };
                          if (!response.ok) {
                            throw new Error(
                              data.error || t("family.errorUpdateRole"),
                            );
                          }
                          if (data.member) {
                            setMembersByFamilyId((prev) => ({
                              ...prev,
                              [family.id]: (prev[family.id] ?? []).map((m) =>
                                m.id === member.id ? { ...m, ...data.member! } : m,
                              ),
                            }));
                            if (member.userId === viewerUserId) {
                              setFamilies((prev) =>
                                prev.map((f) =>
                                  f.id === family.id
                                    ? {
                                        ...f,
                                        membership: {
                                          ...f.membership,
                                          role: data.member!.role,
                                        },
                                      }
                                    : f,
                                ),
                              );
                            }
                          }
                        })
                      }
                      onRemove={() => {
                        if (
                          !window.confirm(
                            t("family.removeMemberConfirm", {
                              name: member.displayName || member.invitedEmail,
                            }),
                          )
                        ) {
                          return;
                        }
                        runAction(`remove-${member.id}`, async () => {
                          const response = await fetch(
                            `/api/family/${family.id}/members/${member.id}`,
                            { method: "DELETE" },
                          );
                          const data = (await response
                            .json()
                            .catch(() => ({}))) as { error?: string };
                          if (!response.ok) {
                            throw new Error(
                              data.error || t("family.errorRemoveMember"),
                            );
                          }
                          setMembersByFamilyId((prev) => ({
                            ...prev,
                            [family.id]: (prev[family.id] ?? []).filter(
                              (m) => m.id !== member.id,
                            ),
                          }));
                          setNotice(t("family.memberRemoved"));
                        });
                      }}
                    />
                  ))
                )}
              </ul>
            </div>
          </section>
        );
      })}

      {/* Allow creating another family later; keep subtle for now */}
      {primary && capabilities.familySharing ? (
        <details className="family-nested rounded-xl border border-dashed border-ink/15 bg-canvas-deep/30 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted">
            {t("family.createAnother")}
          </summary>
          <div className="mt-3 pb-1">
            <CreateFamilyCard
              compact
              pending={pending && busyKey === "create"}
              error={null}
              onCreate={(name) =>
                runAction("create", async () => {
                  const response = await fetch("/api/family", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                  });
                  const data = (await response.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  if (!response.ok) {
                    throw new Error(data.error || t("family.errorCreate"));
                  }
                  setNotice(t("family.newFamilyCreated"));
                })
              }
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CreateFamilyCard({
  onCreate,
  pending,
  error,
  compact = false,
}: {
  onCreate: (name: string) => void;
  pending: boolean;
  error: string | null;
  compact?: boolean;
}) {
  const t = useTranslations();
  const [name, setName] = useState("");

  return (
    <div
      className={cn(
        compact
          ? ""
          : "family-panel ui-empty rounded-2xl border border-ink/10 bg-gradient-to-b from-canvas to-canvas-deep/40 px-6 py-10 text-center",
      )}
    >
      {!compact ? (
        <>
          <span className="ui-empty-icon mx-auto inline-flex">
            <Users className="size-9 text-accent/70" aria-hidden />
          </span>
          <h2 className="ui-empty-title mt-4 font-display text-2xl tracking-tight text-ink">
            {t("family.createYourFamily")}
          </h2>
          <p className="ui-empty-copy mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {t("family.createFamilyLead")}
          </p>
        </>
      ) : null}

      {error ? (
        <p
          id="family-create-error"
          role="alert"
          className="mx-auto mt-4 max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <form
        className={cn(
          "mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row",
          compact ? "mt-0" : "mt-6",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onCreate(trimmed);
        }}
      >
        <label className="sr-only" htmlFor="family-name">
          {t("family.familyNameRequired")}
        </label>
        <input
          id="family-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("family.familyNamePlaceholder")}
          maxLength={120}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "family-create-error" : undefined}
          className="min-w-0 flex-1 rounded-md border border-ink/15 bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {t("family.createFamily")}
        </button>
      </form>
    </div>
  );
}

function InviteForm({
  familyId,
  onInvite,
  disabled,
  busy,
}: {
  familyId: string;
  onInvite: (payload: {
    familyId: string;
    email: string;
    role: "member" | "viewer";
  }) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");

  return (
    <form
      className="mt-6 rounded-xl border border-ink/10 bg-canvas-deep/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;
        onInvite({ familyId, email: trimmed, role });
        setEmail("");
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
        <Mail className="size-4 text-accent-deep" aria-hidden />
        {t("family.inviteSomeone")}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {t("family.inviteLead")}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`invite-email-${familyId}`}>
          {t("family.emailRequired")}
        </label>
        <input
          id={`invite-email-${familyId}`}
          type="email"
          required
          aria-required="true"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("family.emailPlaceholder")}
          autoComplete="email"
          className="min-w-0 flex-1 rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
        />
        <label className="sr-only" htmlFor={`invite-role-${familyId}`}>
          {t("family.role")}
        </label>
        <select
          id={`invite-role-${familyId}`}
          value={role}
          onChange={(event) =>
            setRole(event.target.value as "member" | "viewer")
          }
          className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
        >
          {INVITABLE_FAMILY_ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabel(t, value)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={disabled || busy || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("family.sendInvite")}
        </button>
      </div>
    </form>
  );
}

function MemberRow({
  member,
  viewerUserId,
  isOwner,
  pending,
  busyKey,
  onChangeRole,
  onRemove,
  inviteLink,
}: {
  member: SerializedFamilyMember;
  viewerUserId: string;
  isOwner: boolean;
  pending: boolean;
  busyKey: string | null;
  onChangeRole: (role: "owner" | "member" | "viewer") => void;
  onRemove: () => void;
  inviteLink?: string;
}) {
  const t = useTranslations();
  const format = useFormat();
  const [copied, setCopied] = useState(false);
  const isSelf = member.userId === viewerUserId;
  const isPending = member.status === "pending";
  const title = useMemo(() => {
    if (member.displayName) return member.displayName;
    return member.invitedEmail;
  }, [member.displayName, member.invitedEmail]);

  const roleBusy = pending && busyKey === `role-${member.id}`;
  const removeBusy = pending && busyKey === `remove-${member.id}`;

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          {isSelf ? (
            <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              You
            </span>
          ) : null}
          {isPending ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
              {t("family.statusPending")}
            </span>
          ) : member.firstContributedAt ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-deep">
              {t("family.statusContributing")}
            </span>
          ) : (
            <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              {t("family.statusJoined")}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {member.displayName ? member.invitedEmail : null}
          {member.displayName ? " · " : null}
          {isPending
            ? t("family.invitedOn", { date: format.date(member.invitedAt) })
            : member.firstContributedAt
              ? t("family.contributingSince", {
                  date: format.date(member.firstContributedAt),
                })
              : t("family.joinedWaiting", {
                  date: format.date(member.acceptedAt || member.createdAt),
                })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isOwner && !isSelf ? (
          <select
            value={member.role}
            disabled={pending}
            onChange={(event) =>
              onChangeRole(
                event.target.value as "owner" | "member" | "viewer",
              )
            }
            className="rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
            aria-label={t("family.roleFor", { name: title })}
          >
            {(isPending
              ? INVITABLE_FAMILY_ROLES
              : (["owner", "member", "viewer"] as const)
            ).map((value) => (
              <option key={value} value={value}>
                {roleLabel(t, value)}
                {roleBusy && member.role === value ? "…" : ""}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-md bg-canvas-deep px-2.5 py-1.5 text-xs font-medium text-ink-muted">
            {roleLabel(t, member.role)}
          </span>
        )}

        {inviteLink ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                // ignore
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent/35 hover:bg-accent/10"
          >
            {copied ? (
              <Check className="size-3 text-accent-deep" aria-hidden />
            ) : (
              <Copy className="size-3" aria-hidden />
            )}
            {copied ? t("family.copied") : t("family.copyLink")}
          </button>
        ) : null}

        {isOwner && !isSelf ? (
          <button
            type="button"
            disabled={pending || removeBusy}
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-md border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-red-300 hover:bg-red-50 hover:text-red-800 disabled:opacity-60"
          >
            {removeBusy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <UserMinus className="size-3" aria-hidden />
            )}
            {isPending ? t("common.cancel") : t("family.removeMember")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

