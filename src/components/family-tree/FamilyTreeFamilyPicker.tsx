"use client";

import { cn } from "@/lib/utils";

export type FamilyTreePickerOption = {
  familyId: string;
  familyName: string;
  hasTree: boolean;
};

type Props = {
  families: FamilyTreePickerOption[];
  activeFamilyId: string;
  onSelectFamily: (familyId: string) => void;
  className?: string;
};

/**
 * Switch which family's tree is open. Shown when the user belongs to 2+ families.
 * Does not navigate — parent fetches and swaps the canvas in place.
 */
export function FamilyTreeFamilyPicker({
  families,
  activeFamilyId,
  onSelectFamily,
  className,
}: Props) {
  if (families.length < 2) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <label
        htmlFor="family-tree-family-picker"
        className="text-sm font-medium text-ink-muted"
      >
        Family
      </label>
      <select
        id="family-tree-family-picker"
        className="rounded-lg border border-ink/15 bg-canvas px-3 py-1.5 text-sm font-medium text-ink"
        value={activeFamilyId}
        onChange={(e) => onSelectFamily(e.target.value)}
      >
        {families.map((f) => (
          <option key={f.familyId} value={f.familyId}>
            {f.familyName}
            {!f.hasTree ? " (no tree yet)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
