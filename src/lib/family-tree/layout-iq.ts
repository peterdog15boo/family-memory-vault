/**
 * Layout IQ — traditional family-tree placement rules.
 *
 * Relationships decide who connects to whom (Genealogy Engine).
 * Layout IQ decides where same-generation people sit on the row:
 * spouses stay as atomic couple units, blood siblings on that person's
 * outer side, maternal/paternal clusters kept separate.
 *
 * Critical: never split a spouse pair by treating one partner as an
 * "outer sibling" of someone else (that creates one long top bar and
 * crossing spouse connectors).
 */

export type LayoutIqContext = {
  partnerOf: ReadonlyMap<string, string>;
  siblingAdj: ReadonlyMap<string, ReadonlySet<string>>;
  parentsByChild: ReadonlyMap<string, readonly string[]>;
  /** Optional: cousin_of undirected adjacency for same-gen clustering. */
  cousinAdj?: ReadonlyMap<string, ReadonlySet<string>>;
};

/** A layout unit: a spouse pair or a single person. */
export type LayoutUnit = {
  ids: readonly string[];
  /** True when ids are an oriented [left, right] spouse pair. */
  isCouple: boolean;
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

/** True when this person has a spouse who is also on the same generation row. */
export function isCoupledOnRow(
  id: string,
  idsOnRow: ReadonlySet<string>,
  partnerOf: ReadonlyMap<string, string>,
): boolean {
  const partner = partnerOf.get(id);
  return Boolean(partner && idsOnRow.has(partner));
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
 * Blood siblings of `personId` on this generation, excluding the person,
 * their spouse, and anyone who already forms a couple unit on this row
 * (those people stay inside their own spouse unit).
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
    .filter(
      (id) =>
        id !== personId &&
        !exclude.has(id) &&
        idsOnRow.has(id) &&
        !isCoupledOnRow(id, idsOnRow, ctx.partnerOf),
    )
    .sort((a, b) => a.localeCompare(b));
}

function unitsRelated(
  a: LayoutUnit,
  b: LayoutUnit,
  ctx: LayoutIqContext,
): boolean {
  for (const x of a.ids) {
    for (const y of b.ids) {
      if (ctx.siblingAdj.get(x)?.has(y)) return true;
      if (ctx.cousinAdj?.get(x)?.has(y)) return true;
    }
  }
  return false;
}

function unitSortKey(unit: LayoutUnit, ctx: LayoutIqContext): string {
  const anchor = unit.ids[0]!;
  return parentsKey(ctx.parentsByChild.get(anchor) ?? []) || anchor;
}

/**
 * Build atomic layout units for a generation: spouse pairs never split.
 */
export function familyUnitsForGeneration(
  ids: readonly string[],
  ctx: LayoutIqContext,
): LayoutUnit[] {
  const idSet = new Set(ids);
  const units: LayoutUnit[] = [];
  const used = new Set<string>();

  const coupleSeeds: Array<readonly [string, string]> = [];
  for (const id of ids) {
    if (used.has(id)) continue;
    const partner = ctx.partnerOf.get(id);
    if (!partner || !idSet.has(partner) || used.has(partner)) continue;
    const oriented = orientCouple(id, partner, ctx);
    coupleSeeds.push(oriented);
    used.add(oriented[0]);
    used.add(oriented[1]);
  }
  coupleSeeds.sort(
    (a, b) =>
      unitSortKey({ ids: a, isCouple: true }, ctx).localeCompare(
        unitSortKey({ ids: b, isCouple: true }, ctx),
      ) || a[0].localeCompare(b[0]),
  );
  for (const [left, right] of coupleSeeds) {
    units.push({ ids: [left, right], isCouple: true });
  }

  for (const id of ids) {
    if (used.has(id)) continue;
    used.add(id);
    units.push({ ids: [id], isCouple: false });
  }

  return units;
}

/**
 * Order family units left→right: related units (sibling/cousin bridges)
 * stay adjacent; unrelated maternal/paternal couples stay separate.
 */
export function orderFamilyUnits(
  units: readonly LayoutUnit[],
  ctx: LayoutIqContext,
): LayoutUnit[] {
  if (units.length <= 1) return [...units];

  const n = units.length;
  const parent = units.map((_, i) => i);
  function find(i: number): number {
    let cur = i;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]!]!;
      cur = parent[cur]!;
    }
    return cur;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri === rj) return;
    if (ri < rj) parent[rj] = ri;
    else parent[ri] = rj;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (unitsRelated(units[i]!, units[j]!, ctx)) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(i);
    clusters.set(root, list);
  }

  const orderedClusters = [...clusters.values()].sort((a, b) => {
    const ka = unitSortKey(units[a[0]!]!, ctx);
    const kb = unitSortKey(units[b[0]!]!, ctx);
    return ka.localeCompare(kb);
  });

  const ordered: LayoutUnit[] = [];
  for (const cluster of orderedClusters) {
    // Within a related cluster, keep a stable walk so sibling-linked
    // couples sit next to each other (not interleaved with strangers).
    const remaining = new Set(cluster);
    const seed = [...cluster].sort((i, j) =>
      unitSortKey(units[i]!, ctx).localeCompare(unitSortKey(units[j]!, ctx)),
    )[0]!;
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length > 0) {
      const idx = queue.shift()!;
      ordered.push(units[idx]!);
      const neighbors = [...remaining].filter((j) =>
        unitsRelated(units[idx]!, units[j]!, ctx),
      );
      neighbors.sort((i, j) =>
        unitSortKey(units[i]!, ctx).localeCompare(unitSortKey(units[j]!, ctx)),
      );
      for (const j of neighbors) {
        remaining.delete(j);
        queue.push(j);
      }
      if (queue.length === 0 && remaining.size > 0) {
        const next = [...remaining].sort((i, j) =>
          unitSortKey(units[i]!, ctx).localeCompare(
            unitSortKey(units[j]!, ctx),
          ),
        )[0]!;
        remaining.delete(next);
        queue.push(next);
      }
    }
  }

  return ordered;
}

/**
 * Expand units into a flat left→right person order for a traditional row.
 *
 * Couple block shape:
 *   [unmarried siblings of left…][left][right][unmarried siblings of right…]
 *
 * Married people are never pulled into another couple's sibling slots.
 */
export function orderGenerationForLayout(
  ids: readonly string[],
  ctx: LayoutIqContext,
): string[] {
  if (ids.length <= 1) return [...ids];

  const idSet = new Set(ids);
  const units = orderFamilyUnits(familyUnitsForGeneration(ids, ctx), ctx);
  const ordered: string[] = [];
  const used = new Set<string>();

  const take = (id: string) => {
    if (!idSet.has(id) || used.has(id)) return;
    ordered.push(id);
    used.add(id);
  };

  for (const unit of units) {
    if (unit.isCouple && unit.ids.length === 2) {
      const [left, right] = unit.ids as [string, string];
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
      continue;
    }

    for (const id of unit.ids) {
      if (used.has(id)) continue;
      // Unmarried sibling cluster around this singleton.
      const cluster = [
        id,
        ...outerSiblingsOf(id, idSet, ctx, new Set([id])).filter(
          (s) => !used.has(s),
        ),
      ];
      // Prefer attaching near an already-placed cousin.
      let attachAfter: number | null = null;
      if (ctx.cousinAdj) {
        for (const member of cluster) {
          for (const cousin of ctx.cousinAdj.get(member) ?? []) {
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
        for (const member of cluster) take(member);
      } else {
        const insert = cluster.filter((m) => !used.has(m));
        ordered.splice(attachAfter + 1, 0, ...insert);
        for (const member of insert) used.add(member);
      }
    }
  }

  for (const id of ids) take(id);
  return ordered;
}
