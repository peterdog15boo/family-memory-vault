"use client";

import type { ReactNode } from "react";
import { WillSigningPanel } from "@/components/will-planner/WillSigningPanel";
import {
  CHILD_RELATION_OPTIONS,
  SITUATION_PACK_OPTIONS,
  US_STATE_OPTIONS,
  type WillAnswers,
  type WillChildEntry,
  type WillGiftEntry,
  type WillRealEstateEntry,
  type WillResidueShare,
  type WillSituationPacks,
  type WillStep,
} from "@/lib/will-planner";
import { validateResiduePercents } from "@/lib/will-planner/validate";

type FieldDef = WillStep["fields"][number];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-2 text-sm";

export function WillPlannerFields({
  step,
  answers,
  onChange,
}: {
  step: WillStep;
  answers: WillAnswers;
  onChange: (next: WillAnswers) => void;
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
      {step.id === "basics" && answers.stateCode ? (
        <WillSigningPanel stateCode={answers.stateCode} variant="short" />
      ) : null}
    </div>
  );
}

function ResiduePercentHint({ answers }: { answers: WillAnswers }) {
  const result = validateResiduePercents(answers);
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
  field: FieldDef;
  answers: WillAnswers;
  onChange: (next: WillAnswers) => void;
}) {
  const value = answers[field.key];

  if (field.type === "packs_checklist") {
    const packs: WillSituationPacks = answers.packs ?? {};
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
          {SITUATION_PACK_OPTIONS.map((pack) => {
            const checked = packs[pack.id] === true;
            return (
              <li key={pack.id}>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[color:var(--legacy-accent)]"
                    checked={checked}
                    onChange={(e) => {
                      const next: WillSituationPacks = {
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
          {(
            [
              ["yes", true],
              ["no", false],
            ] as const
          ).map(([label, bool]) => (
            <label
              key={label}
              className="flex items-center gap-2 text-sm text-[color:var(--legacy-ink)]"
            >
              <input
                type="radio"
                name={String(field.key)}
                checked={boolVal === label}
                onChange={() => onChange({ ...answers, [field.key]: bool })}
              />
              {label === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "checkboxes") {
    const selected = new Set(
      Array.isArray(value) ? (value as string[]) : [],
    );
    return (
      <fieldset>
        <legend className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </legend>
        <div className="mt-2 space-y-2">
          {(field.options ?? []).map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm text-[color:var(--legacy-ink)]"
            >
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange({
                    ...answers,
                    [field.key]: Array.from(next),
                  });
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "state") {
    return (
      <label className="block">
        <span className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </span>
        {field.hint ? (
          <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </span>
        ) : null}
        <select
          className={inputClass}
          value={(value as string) ?? ""}
          onChange={(e) =>
            onChange({ ...answers, stateCode: e.target.value || undefined })
          }
          required={field.required}
        >
          <option value="">Select state…</option>
          {US_STATE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </span>
        {field.hint ? (
          <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </span>
        ) : null}
        <select
          className={inputClass}
          value={(value as string) ?? ""}
          onChange={(e) =>
            onChange({
              ...answers,
              [field.key]: e.target.value || undefined,
            })
          }
          required={field.required}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "children_list") {
    const children = (answers.children ?? []) as WillChildEntry[];
    return (
      <div>
        <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </p>
        {field.hint ? (
          <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          {children.map((child, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-xl border border-[color:var(--legacy-line)] p-3"
            >
              <div className="flex flex-wrap gap-2">
                <input
                  className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
                  placeholder="Name"
                  value={child.name}
                  onChange={(e) => {
                    const next = [...children];
                    next[idx] = { ...child, name: e.target.value };
                    onChange({ ...answers, children: next });
                  }}
                />
                <input
                  className={`w-36 ${inputClass} mt-0`}
                  placeholder="DOB (optional)"
                  value={child.dob ?? ""}
                  onChange={(e) => {
                    const next = [...children];
                    next[idx] = { ...child, dob: e.target.value };
                    onChange({ ...answers, children: next });
                  }}
                />
                <select
                  className={`w-36 ${inputClass} mt-0`}
                  value={child.relation ?? ""}
                  onChange={(e) => {
                    const next = [...children];
                    next[idx] = {
                      ...child,
                      relation: (e.target.value ||
                        undefined) as WillChildEntry["relation"],
                    };
                    onChange({ ...answers, children: next });
                  }}
                >
                  <option value="">Relation…</option>
                  {CHILD_RELATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn-ghost text-sm"
                onClick={() =>
                  onChange({
                    ...answers,
                    children: children.filter((_, i) => i !== idx),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ui-btn ui-btn-secondary text-sm"
            onClick={() =>
              onChange({
                ...answers,
                children: [...children, { name: "", dob: "" }],
              })
            }
          >
            Add child
          </button>
        </div>
      </div>
    );
  }

  if (field.type === "gifts_list") {
    const gifts = (answers.specificGifts ?? []) as WillGiftEntry[];
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

  if (field.type === "residue_shares") {
    const shares = (answers.residueShares ?? []) as WillResidueShare[];
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
                const raw = e.target.value;
                const next = [...shares];
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

  if (field.type === "real_estate_list") {
    const props = (value as WillRealEstateEntry[] | undefined) ?? [];
    const key = field.key;
    return (
      <ListEditor
        label={field.label}
        hint={field.hint}
        addLabel="Add property"
        items={props}
        onAdd={() =>
          onChange({
            ...answers,
            [key]: [...props, { address: "", whoShouldReceive: "" }],
          })
        }
        onRemove={(idx) =>
          onChange({
            ...answers,
            [key]: props.filter((_, i) => i !== idx),
          })
        }
        renderItem={(prop, idx) => (
          <>
            <input
              className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
              placeholder="Address"
              value={prop.address}
              onChange={(e) => {
                const next = [...props];
                next[idx] = { ...prop, address: e.target.value };
                onChange({ ...answers, [key]: next });
              }}
            />
            <input
              className={`min-w-[10rem] flex-1 ${inputClass} mt-0`}
              placeholder="Who should receive"
              value={prop.whoShouldReceive}
              onChange={(e) => {
                const next = [...props];
                next[idx] = { ...prop, whoShouldReceive: e.target.value };
                onChange({ ...answers, [key]: next });
              }}
            />
          </>
        )}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {field.label}
        </span>
        {field.hint ? (
          <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
            {field.hint}
          </span>
        ) : null}
        <textarea
          className={inputClass}
          value={(value as string) ?? ""}
          rows={4}
          onChange={(e) =>
            onChange({
              ...answers,
              [field.key]: e.target.value || undefined,
            })
          }
          required={field.required}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--legacy-ink)]">
        {field.label}
      </span>
      {field.hint ? (
        <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
          {field.hint}
        </span>
      ) : null}
      <input
        className={inputClass}
        value={(value as string) ?? ""}
        onChange={(e) =>
          onChange({
            ...answers,
            [field.key]: e.target.value || undefined,
          })
        }
        required={field.required}
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
    <div>
      <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">{hint}</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-wrap items-start gap-2">
            {renderItem(item, idx)}
            <button
              type="button"
              className="ui-btn ui-btn-ghost text-sm"
              onClick={() => onRemove(idx)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ui-btn ui-btn-secondary text-sm"
          onClick={onAdd}
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}
