/**
 * Client-safe cousin wizard helpers — no DB / people / sharp imports.
 */

import { bloodParentsOfSubject } from "@/lib/family-tree/cousin-lineage";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type CousinAttachWhich = "parent1" | "parent2" | "unsure";

export type CousinAttachCandidate = {
  id: string;
  label: string;
  kind: "parent" | "aunt_uncle";
};

/**
 * People on P’s blood side that a new cousin-parent can sibling-link to:
 * P’s blood parents and their siblings (aunts/uncles) already on the tree.
 */
export function listCousinAttachCandidates(
  graph: {
    nodes: Array<{ id: string; label: string }>;
    relationships: Array<{
      fromNodeId: string;
      toNodeId: string;
      type: string;
    }>;
  },
  subjectId: string,
): CousinAttachCandidate[] {
  const lineage = {
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label })),
    relationships: graph.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type as FamilyTreeRelationType,
    })),
  };
  const labelOf = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.label ?? id;

  const blood = bloodParentsOfSubject(lineage, subjectId);
  const out: CousinAttachCandidate[] = [];
  const seen = new Set<string>();

  for (const pid of blood) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({ id: pid, label: labelOf(pid), kind: "parent" });
  }

  for (const pid of blood) {
    for (const r of graph.relationships) {
      if (r.type !== "sibling_of") continue;
      const other =
        r.fromNodeId === pid
          ? r.toNodeId
          : r.toNodeId === pid
            ? r.fromNodeId
            : null;
      if (!other || seen.has(other)) continue;
      seen.add(other);
      out.push({ id: other, label: labelOf(other), kind: "aunt_uncle" });
    }
  }

  return out;
}
