"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  TRUST_PACK_OPTIONS,
  US_STATE_OPTIONS,
  defaultTrustName,
  isCommunityPropertyState,
  validateTrustResiduePercents,
  type TrustAnswers,
  type TrustFieldDef,
  type TrustGiftEntry,
  type TrustRealEstateEntry,
  type TrustResidueShare,
  type TrustSituationPacks,
  type TrustStep,
} from "@/lib/trust-planner";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-2 text-sm";

export function TrustPlannerFields({
  step,
  answers,
  onChange,
}: {
  step: TrustStep;
  answers: TrustAnswers;
  onChange: (next: TrustAnswers) => void;
}) {
  return (
    <div className="space-y-5">
      {step.whyWeAsk ? (
        <p
          className="rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/40 px-3 py-2.5 text-xs leading-relaxed text-[color:var(--legacy-muted)]"
          role="note"
        >
          {step.whyWeAsk}
        </p>
      ) : null}

      {step.id === "basics" ? (
        <TrustNameHint answers={answers} onChange={onChange} />
      ) : null}

      {step.id === "married" && isCommunityPropertyState(answers.stateCode) ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950"
          role="note"
        >
          Your domicile ({answers.stateCode}) is a community-property state. Ask
          your attorney about community vs. separate property and any spousal
          consent or joinder before funding a trust.
        </p>
      ) : null}

      {step.id === "trustees" ? (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          <strong className="font-medium text-[color:var(--legacy-ink)]">
            Initial trustee:
          </strong>{" "}
          you ({answers.fullLegalName?.trim() || "the grantor"}). A co-trustee
          is optional.
        </p>
      ) : null}

      {step.id === "retirement" ? (
        <p
          className="rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/40 px-3 py-2.5 text-xs leading-relaxed text-[color:var(--legacy-muted)]"
          role="note"
        >
          Retirement and life insurance usually stay in your name; the
          beneficiary form is the lever — ask your attorney before naming the
          trust on an IRA.
        </p>
      ) : null}

      {step.id === "crypto" ? (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          Never enter keys, seed phrases, or passwords here. Put access notes in{" "}
          <Link
            href="/documents/legacy"
            className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
          >
            Digital Legacy
          </Link>{" "}
          instead.
        </p>
      ) : null}

      {step.id === "pour_over" ? (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          Many people pair a revocable living trust with a{" "}
          <strong className="font-medium text-[color:var(--legacy-ink)]">
            pour-over will
          </strong>{" "}
          so assets not yet in the trust still have a path into it.{" "}
          <Link
            href="/legacy/will"
            className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
          >
            Open Will Planner
          </Link>{" "}
          for a companion draft your attorney can align with this trust plan.
        </p>
      ) : null}

      {step.fields.map((field) => {
        if (field.showWhen && !field.showWhen(answers)) return null;
        return (
          <FieldControl
            key={String(field.key)}
            field={field}
            answers={answers}
            onChange={onChange}
          />
        );
      })}

      {step.id === "residue" && answers.residueMode === "specific_percents" ? (
        <ResiduePercentHint answers={answers} />
      ) : null}

      {step.id === "review" ? (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          When you generate, we create an attorney planning draft from your
          answers. This planner does not add irrevocable, tax, Crummey, or QTIP
          clauses.
        </p>
      ) : null}
    </div>
  );
}

function TrustNameHint({
  answers,
  onChange,
}: {
  answers: TrustAnswers;
  onChange: (next: TrustAnswers) => void;
}) {
  const suggestion = defaultTrustName(answers.fullLegalName);
  return (
    <p className="text-xs text-[color:var(--legacy-muted)]">
      Suggested name:{" "}
      <button
        type="button"
        className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
        onClick={() => onChange({ ...answers, trustName: suggestion })}
      >
        {suggestion}
      </button>
    </p>
  );
}

function ResiduePercentHint({ answers }: { answers: TrustAnswers }) {
  const result = validateTrustResiduePercents(answers);
  if (result.ok) {
    return (
      <p className="text-xs text-[color:var(--legacy-muted)]">
        Percents total 100%.
      </p>
    );
  }
  return (
    <p className="text-xs text-red-700" role="status">
      {result.error}
    </p>
  );
}

function FieldControl({
  field,
  answers,
  onChange,
}: {
  field: TrustFieldDef;
  answers: TrustAnswers;
  onChange: (next: TrustAnswers) => void;
}) {
  const value = answers[field.key];

  if (field.type === "packs_checklist") {
    const packs: TrustSituationPacks = answers.packs ?? {};
    return (
      <fieldset>
        <legend className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </legend>
        {field.hint ? (
          <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {TRUST_PACK_OPTIONS.map((pack) => {
            const checked = packs[pack.id] === true;
            return (
              <li key={pack.id}>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[color:var(--legacy-accent)]"
                    checked={checked}
                    onChange={(e) => {
                      const next: TrustSituationPacks = {
                        ...packs,
                        [pack.id]: e.target.checked,
                      };
                      onChange({ ...answers, packs: next });
                    }}
                  />
                  <span>
                    <span className="font-medium text-[color:var(--legacy-ink)]">
                      {pack.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[color:var(--legacy-muted)]">
                      {pack.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    );
  }

  if (field.type === "yesno") {
    const boolVal = value === true ? "yes" : value === false ? "no" : "";
    return (
      <fieldset>
        <legend className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </legend>
        {field.hint ? (
          <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </p>
        ) : null}
        <div className="mt-2 flex gap-4">
          {(["yes", "no"] as const).map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={String(field.key)}
                checked={boolVal === opt}
                onChange={() =>
                  onChange({
                    ...answers,
                    [field.key]: opt === "yes",
                  })
                }
              />
              {opt === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "select" || field.type === "state") {
    const options =
      field.type === "state" || field.key === "stateCode"
        ? US_STATE_OPTIONS
        : (field.options ?? []);
    return (
      <label className="block text-sm">
        <span className="font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </span>
        {field.hint ? (
          <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </span>
        ) : null}
        <select
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => {
            const next = { ...answers, [field.key]: e.target.value };
            if (
              field.key === "fullLegalName" ||
              (field.key === "stateCode" && !answers.trustName?.trim())
            ) {
              // no-op for state; trust name filled via name below
            }
            if (field.key !== "trustName" && !answers.trustName?.trim()) {
              const nameForDefault =
                field.key === "fullLegalName"
                  ? e.target.value
                  : answers.fullLegalName;
              if (nameForDefault?.trim()) {
                next.trustName = defaultTrustName(nameForDefault);
              }
            }
            onChange(next);
          }}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "residue_shares") {
    const shares = (answers.residueShares ?? []) as TrustResidueShare[];
    return (
      <ListEditor
        label={field.label}
        hint={field.hint}
        addLabel="Add person"
        items={shares}
        onAdd={() =>
          onChange({
            ...answers,
            residueShares: [...shares, { name: "", percent: "" }],
          })
        }
        onRemove={(idx) =>
          onChange({
            ...answers,
            residueShares: shares.filter((_, i) => i !== idx),
          })
        }
        renderItem={(share, idx) => (
          <>
            <input
              className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
              placeholder="Person"
              value={share.name}
              onChange={(e) => {
                const next = [...shares];
                next[idx] = { ...share, name: e.target.value };
                onChange({ ...answers, residueShares: next });
              }}
            />
            <input
              className={`w-24 ${inputClass} mt-0`}
              type="number"
              min={0}
              max={100}
              step={0.01}
              placeholder="%"
              value={share.percent === "" ? "" : share.percent}
              onChange={(e) => {
                const next = [...shares];
                const raw = e.target.value;
                next[idx] = {
                  ...share,
                  percent: raw === "" ? "" : Number(raw),
                };
                onChange({ ...answers, residueShares: next });
              }}
            />
          </>
        )}
      />
    );
  }

  if (field.type === "gifts_list") {
    const gifts = (answers.specificGifts ?? []) as TrustGiftEntry[];
    return (
      <ListEditor
        label={field.label}
        hint={field.hint}
        addLabel="Add gift"
        items={gifts}
        onAdd={() =>
          onChange({
            ...answers,
            specificGifts: [...gifts, { item: "", recipient: "" }],
          })
        }
        onRemove={(idx) =>
          onChange({
            ...answers,
            specificGifts: gifts.filter((_, i) => i !== idx),
          })
        }
        renderItem={(gift, idx) => (
          <>
            <input
              className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
              placeholder="Item or cash amount"
              value={gift.item}
              onChange={(e) => {
                const next = [...gifts];
                next[idx] = { ...gift, item: e.target.value };
                onChange({ ...answers, specificGifts: next });
              }}
            />
            <input
              className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
              placeholder="Person"
              value={gift.recipient}
              onChange={(e) => {
                const next = [...gifts];
                next[idx] = { ...gift, recipient: e.target.value };
                onChange({ ...answers, specificGifts: next });
              }}
            />
          </>
        )}
      />
    );
  }

  if (field.type === "addresses_list") {
    const addrs = (answers.realEstateAddresses ?? []) as TrustRealEstateEntry[];
    return (
      <ListEditor
        label={field.label}
        hint={field.hint}
        addLabel="Add address"
        items={addrs}
        onAdd={() =>
          onChange({
            ...answers,
            realEstateAddresses: [...addrs, { address: "" }],
          })
        }
        onRemove={(idx) =>
          onChange({
            ...answers,
            realEstateAddresses: addrs.filter((_, i) => i !== idx),
          })
        }
        renderItem={(row, idx) => (
          <input
            className={`min-w-[12rem] flex-1 ${inputClass} mt-0`}
            placeholder="Street address"
            value={row.address}
            onChange={(e) => {
              const next = [...addrs];
              next[idx] = { address: e.target.value };
              onChange({ ...answers, realEstateAddresses: next });
            }}
          />
        )}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block text-sm">
        <span className="font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </span>
        {field.hint ? (
          <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </span>
        ) : null}
        <textarea
          className={`${inputClass} min-h-[7rem] resize-y`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            onChange({ ...answers, [field.key]: e.target.value })
          }
        />
      </label>
    );
  }

  return (
    <label className="block text-sm">
      <span className="font-medium text-[color:var(--legacy-ink)]">
        {field.label}
      </span>
      {field.hint ? (
        <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
          {field.hint}
        </span>
      ) : null}
      <input
        type="text"
        className={inputClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => {
          const next: TrustAnswers = {
            ...answers,
            [field.key]: e.target.value,
          };
          if (
            field.key === "fullLegalName" &&
            !answers.trustName?.trim()
          ) {
            next.trustName = defaultTrustName(e.target.value);
          }
          onChange(next);
        }}
      />
    </label>
  );
}

function ListEditor<T>({
  label,
  hint,
  addLabel,
  items,
  onAdd,
  onRemove,
  renderItem,
}: {
  label: string;
  hint?: string;
  addLabel: string;
  items: T[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  renderItem: (item: T, idx: number) => ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-[color:var(--legacy-ink)]">
        {label}
      </legend>
      {hint ? (
        <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">{hint}</p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] p-2"
          >
            {renderItem(item, idx)}
            <button
              type="button"
              className="ui-btn ui-btn-ghost text-xs"
              onClick={() => onRemove(idx)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ui-btn ui-btn-secondary mt-3 text-sm"
        onClick={onAdd}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
