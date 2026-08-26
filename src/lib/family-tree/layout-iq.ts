/**
 * Layout IQ — traditional family-tree placement rules.
 *
 * Relationships decide who connects to whom (Genealogy Engine).
 * Layout IQ decides where same-generation people sit on the row:
 * spouses side-by-side, blood siblings on that person's outer side,
 * maternal/paternal clusters kept together.
 */

export type LayoutIqContext = {
  partnerOf: ReadonlyMap<string, string>;
  siblingAdj: ReadonlyMap<string, ReadonlySet<string>>;
  parentsByChild: ReadonlyMap<string, readonly string[]>;
  /** Optional: cousin_of undirected adjacency for same-gen clustering. */
  cousinAdj?: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Soft-link in-laws into the sibling graph for layout only.
 * A sister-in-law of the husband sits with the wife (and vice versa).
 */
export function applyInLawSoftSiblings(
  siblingAdj: Map<string, Set<string>>,
  partnerOf: ReadonlyMap<string, string>,
  inLawPairs: ReadonlyArray<readonly [string, string]>,
): void {
  const link = (a: string, b: string) => {
    if (a === b) return;
    const sa = siblingAdj.get(a) ?? new Set<string>();
    sa.add(b);
    siblingAdj.set(a, sa);
    const sb = siblingAdj.get(b) ?? new Set<string>();
    sb.add(a);
    siblingAdj.set(b, sb);
  };

  for (const [a, b] of inLawPairs) {
    const spouseA = partnerOf.get(a);
    const spouseB = partnerOf.get(b);
    if (spouseA && spouseA !== b) {
      link(b, spouseA);
    } else if (spouseB && spouseB !== a) {
      link(a, spouseB);
    } else {
      link(a, b);
    }
  }
}

function parentsKey(parents: readonly string[]): string {
  return [...parents].sort().join("+");
}

/**
 * Union-find sibling components: explicit sibling_of + shared biological parents.
 */
export function siblingComponents(
  ids: readonly string[],
  ctx: LayoutIqContext,
): string[][] {
  const idSet = new Set(ids);
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  function find(a: string): string {
    let cur = a;
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!;
      parent.set(cur, parent.get(p)!);
      cur = parent.get(cur)!;
    }
    return cur;
  }
  function union(a: string, b: string) {
    if (!idSet.has(a) || !idSet.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  }

  for (const id of ids) {
    for (const sib of ctx.siblingAdj.get(id) ?? []) {
      union(id, sib);
    }
  }

  const byParents = new Map<string, string[]>();
  for (const id of ids) {
    const key = parentsKey(ctx.parentsByChild.get(id) ?? []);
    if (!key) continue;
    const list = byParents.get(key) ?? [];
    list.push(id);
    byParents.set(key, list);
  }
  for (const list of byParents.values()) {
    for (let i = 1; i < list.length; i++) {
      union(list[0]!, list[i]!);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.localeCompare(b)));
}

/**
 * Orient a couple left→right for traditional display.
 * Prefer putting each person under their own parent cluster when hints exist;
 * otherwise stable id order.
 */
export function orientCouple(
  a: string,
  b: string,
  ctx: LayoutIqContext,
): readonly [string, string] {
  const aParents = parentsKey(ctx.parentsByChild.get(a) ?? []);
  const bParents = parentsKey(ctx.parentsByChild.get(b) ?? []);
  if (aParents && bParents && aParents !== bParents) {
    return aParents < bParents ? [a, b] : [b, a];
  }
  if (aParents && !bParents) return [a, b];
  if (bParents && !aParents) return [b, a];
  return a <= b ? [a, b] : [b, a];
}

/**
 * Blood siblings of `personId` on this generation, excluding the person and
 * their spouse (spouse sits in the couple unit, not as a "sibling slot").
 */
export function outerSiblingsOf(
  personId: string,
  idsOnRow: ReadonlySet<string>,
  ctx: LayoutIqContext,
  exclude: ReadonlySet<string>,
): string[] {
  const components = siblingComponents([...idsOnRow], ctx);
  const mine = components.find((c) => c.includes(personId));
  if (!mine) return [];
  return mine
    .filter((id) => id !== personId && !exclude.has(id) && idsOnRow.has(id))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Order one generation left→right for a traditional tree row.
 *
 * Couple block shape:
 *   [siblings of left…][left][right][siblings of right…]
 *
 * So a wife's sister lands on the wife's outer side — never past the husband.
 */
export function orderGenerationForLayout(
  ids: readonly string[],
  ctx: LayoutIqContext,
): string[] {
  if (ids.length <= 1) return [...ids];

  const idSet = new Set(ids);
  const ordered: string[] = [];
  const used = new Set<string>();

  const take = (id: string) => {
    if (!idSet.has(id) || used.has(id)) return;
    ordered.push(id);
    used.add(id);
  };

  // Partner pairs where both appear on this row.
  const couples: Array<readonly [string, string]> = [];
  const inCouple = new Set<string>();
  for (const id of ids) {
    if (inCouple.has(id)) continue;
    const partner = ctx.partnerOf.get(id);
    if (!partner || !idSet.has(partner) || inCouple.has(partner)) continue;
    const oriented = orientCouple(id, partner, ctx);
    couples.push(oriented);
    inCouple.add(oriented[0]);
    inCouple.add(oriented[1]);
  }

  // Stable couple order: by left person's parent key / id.
  couples.sort((a, b) => {
    const ka = parentsKey(ctx.parentsByChild.get(a[0]) ?? []) || a[0];
    const kb = parentsKey(ctx.parentsByChild.get(b[0]) ?? []) || b[0];
    return ka.localeCompare(kb) || a[0].localeCompare(b[0]);
  });

  for (const [left, right] of couples) {
    const exclude = new Set([left, right]);
    const leftOuter = outerSiblingsOf(left, idSet, ctx, exclude).filter(
      (id) => !used.has(id),
    );
    const rightOuter = outerSiblingsOf(right, idSet, ctx, exclude).filter(
      (id) => !used.has(id) && !leftOuter.includes(id),
    );

    for (const id of leftOuter) take(id);
    take(left);
    take(right);
    for (const id of rightOuter) take(id);
  }

  // Remaining sibling components (unmarried sibling sets, etc.).
  const remainingComponents = siblingComponents(
    ids.filter((id) => !used.has(id)),
    ctx,
  ).sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  for (const component of remainingComponents) {
    // Prefer attaching near an already-placed cousin if linked.
    let attachAfter: number | null = null;
    if (ctx.cousinAdj) {
      for (const id of component) {
        for (const cousin of ctx.cousinAdj.get(id) ?? []) {
          if (!used.has(cousin)) continue;
          const idx = ordered.indexOf(cousin);
          if (idx >= 0) {
            attachAfter = idx;
            break;
          }
        }
        if (attachAfter != null) break;
      }
    }

    if (attachAfter == null) {
      for (const id of component) take(id);
      continue;
    }

    // Insert cousin cluster immediately after the related person (same gen).
    const cluster = component.filter((id) => !used.has(id));
    ordered.splice(attachAfter + 1, 0, ...cluster);
    for (const id of cluster) used.add(id);
  }

  for (const id of ids) take(id);
  return ordered;
}
