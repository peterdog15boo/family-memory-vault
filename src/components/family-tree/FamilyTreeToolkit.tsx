"use client";

import { useMemo, useState } from "react";
import {
  GitFork,
  Heart,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";
import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { treeNodeInitials } from "@/lib/family-tree/layout";
import {
  FAMILY_TREE_RELATION_CHOICES,
  resolveRelationChoice,
  type FamilyTreeRelationChoiceId,
} from "@/lib/family-tree/relations";
import { cn } from "@/lib/utils";

const PLACEHOLDER_CHIPS = [
  "Mom",
  "Dad",
  "Grandma",
  "Grandpa",
  "Aunt",
  "Uncle",
  "Sister",
  "Brother",
] as const;
type Props = {
  tree: SerializedFamilyTreeGraph;
  availablePeople: SerializedFamilyTreePerson[];
  coverByPersonId: Map<string, FamilyTreePersonCover>;
  pending: boolean;
  onPlacePerson: (personId: string) => void;
  onAddPlaceholder: (label: string) => void;
  onConnect: (
    fromNodeId: string,
    toNodeId: string,
    type: FamilyTreeRelationType,
  ) => void | Promise<void>;
};

/**
 * Obvious, guided starter tools — place people, placeholders, and connect
 * relationships without genealogy jargon.
 */
export function FamilyTreeToolkit({
  tree,
  availablePeople,
  coverByPersonId,
  pending,
  onPlacePerson,
  onAddPlaceholder,
  onConnect,
}: Props) {
  const [peopleQuery, setPeopleQuery] = useState("");
  const [placeholderLabel, setPlaceholderLabel] = useState("");
  const [connectFromId, setConnectFromId] = useState("");
  const [connectChoice, setConnectChoice] = useState<
    FamilyTreeRelationChoiceId | ""
  >("");
  const [connectToId, setConnectToId] = useState("");

  const filteredPeople = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    if (!q) return availablePeople;
    return availablePeople.filter((p) =>
      p.displayName.toLowerCase().includes(q),
    );
  }, [availablePeople, peopleQuery]);

  const visibleChoices = FAMILY_TREE_RELATION_CHOICES;

  function submitPlaceholder(label?: string) {
    const value = (label ?? placeholderLabel).trim();
    if (!value) return;
    onAddPlaceholder(value);
    setPlaceholderLabel("");
  }

  async function submitConnect() {
    if (!connectFromId || !connectToId || !connectChoice) return;
    if (connectFromId === connectToId) return;

    const resolved = resolveRelationChoice(
      connectChoice,
      connectFromId,
      connectToId,
    );
    try {
      await onConnect(resolved.fromNodeId, resolved.toNodeId, resolved.type);
      setConnectFromId("");
      setConnectChoice("");
      setConnectToId("");
    } catch {
      // Keep the form filled; the builder surfaces the error.
    }
  }

  const connectReady =
    Boolean(connectFromId && connectChoice && connectToId) &&
    connectFromId !== connectToId;

  return (
    <section
      className="family-tree-toolkit"
      aria-label="Tools to build your family tree"
    >
      <header className="family-tree-toolkit-intro">
        <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
          Build your tree
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Prefer people already in People (with face thumbnails). Add a temporary
          name only when you need a relative who isn’t in photos yet — then link
          them later. Connect how they’re related when you’re ready.
        </p>
      </header>

      <div className="family-tree-toolkit-grid">
        {/* 1. Unplaced People */}
        <div className="family-tree-toolkit-card family-tree-toolkit-card--span">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="family-tree-form-title">
                <Users className="size-4" aria-hidden />
                Not yet on the tree
              </h3>
              <p className="family-tree-form-lead">
                {availablePeople.length === 0
                  ? "Everyone from your People is already on the tree — or add a temporary name below."
                  : "Your People, with face thumbnails when available. Tap to place them on the tree."}
              </p>
            </div>
            {availablePeople.length > 0 ? (
              <label className="family-tree-search">
                <Search className="size-3.5 shrink-0 opacity-60" aria-hidden />
                <span className="sr-only">Search people</span>
                <input
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  placeholder="Search…"
                  className="family-tree-search-input"
                  disabled={pending}
                />
              </label>
            ) : null}
          </div>

          {availablePeople.length > 0 ? (
            <ul className="family-tree-unplaced-list">
              {filteredPeople.length === 0 ? (
                <li className="px-1 py-3 text-sm text-ink-muted">
                  No matches for “{peopleQuery.trim()}”.
                </li>
              ) : (
                filteredPeople.map((person) => {
                  const cover = coverByPersonId.get(person.id);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        className="family-tree-unplaced-item"
                        disabled={pending}
                        onClick={() => onPlacePerson(person.id)}
                      >
                        <span className="family-tree-unplaced-avatar">
                          {cover?.previewUrl ? (
                            <PersonAvatar
                              previewUrl={cover.previewUrl}
                              boundingBox={cover.boundingBox}
                              framing={cover.framing}
                              alt=""
                              className="size-full"
                            />
                          ) : (
                            <span
                              className="family-tree-person-initials text-sm"
                              aria-hidden
                            >
                              {treeNodeInitials(person.displayName)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left font-medium text-ink">
                          {person.displayName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-deep">
                          <Plus className="size-3.5" aria-hidden />
                          Add
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>

        {/* 2. Placeholder */}
        <div
          id="family-tree-add-by-name"
          className="family-tree-toolkit-card"
        >
          <h3 className="family-tree-form-title">
            <UserPlus className="size-4" aria-hidden />
            Add by name
          </h3>
          <p className="family-tree-form-lead">
            No matching Person yet? Add “Grandpa” or “Aunt May” as a temporary
            label — then link the real Person from People when their photo exists.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="family-tree-chip"
                disabled={pending}
                onClick={() => submitPlaceholder(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitPlaceholder();
            }}
          >
            <input
              className="ui-input min-w-[8rem] flex-1"
              value={placeholderLabel}
              onChange={(e) => setPlaceholderLabel(e.target.value)}
              placeholder="Or type a name…"
              maxLength={120}
              disabled={pending}
            />
            <button
              type="submit"
              className="ui-btn ui-btn-secondary"
              disabled={pending || !placeholderLabel.trim()}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Add
            </button>
          </form>
        </div>

        {/* 3. Connect */}
        <div className="family-tree-toolkit-card">
          <h3 className="family-tree-form-title">
            <GitFork className="size-4" aria-hidden />
            Connect two people
          </h3>
          <p className="family-tree-form-lead">
            {tree.nodes.length < 2
              ? "Add at least two people first, then connect them here."
              : "Add a parent, partner, child, or brother/sister. Other relatives are created through those links."}
          </p>

          <ol className="family-tree-connect-steps">
            <li>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">1. Who?</span>
                <select
                  className="ui-input"
                  value={connectFromId}
                  onChange={(e) => setConnectFromId(e.target.value)}
                  disabled={pending || tree.nodes.length < 2}
                >
                  <option value="">Choose someone…</option>
                  {tree.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.person?.displayName ?? n.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
            <li>
              <p className="mb-1.5 text-sm font-medium text-ink">2. How related?</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {visibleChoices.map((choice) => {
                  const active = connectChoice === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={cn(
                        "family-tree-rel-choice",
                        active && "family-tree-rel-choice--active",
                      )}
                      disabled={pending || !connectFromId}
                      onClick={() => setConnectChoice(choice.id)}
                    >
                      <span className="min-w-0 text-left">
                        <span className="block text-xs font-semibold leading-snug">
                          {choice.label}
                        </span>
                        <span className="block text-[0.7rem] text-ink-muted">
                          {choice.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
            <li>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">3. To whom?</span>
                <select
                  className="ui-input"
                  value={connectToId}
                  onChange={(e) => setConnectToId(e.target.value)}
                  disabled={pending || !connectFromId || !connectChoice}
                >
                  <option value="">Choose someone…</option>
                  {tree.nodes
                    .filter((n) => n.id !== connectFromId)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.person?.displayName ?? n.label}
                      </option>
                    ))}
                </select>
              </label>
            </li>
          </ol>

          <button
            type="button"
            className="ui-btn ui-btn-primary mt-3 w-full sm:w-auto"
            disabled={pending || !connectReady}
            onClick={submitConnect}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Heart className="size-4" aria-hidden />
            )}
            Save connection
          </button>
        </div>
      </div>
    </section>
  );
}
