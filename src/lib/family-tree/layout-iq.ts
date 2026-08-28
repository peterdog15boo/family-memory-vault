/**
 * Layout IQ — traditional family-tree placement rules.
 *
 * Relationships decide who connects to whom (Genealogy Engine).
 * Layout IQ decides where same-generation people sit on the row:
 * spouses stay as atomic couple units, blood siblings form one contiguous
 * spine on that person’s outer side (in-laws dock on free ends — never
 * between two blood siblings), maternal/paternal clusters kept separate.
 *
 * Critical: never split a spouse pair by treating one partner as an
 * "outer sibling" of someone else (that creates one long top bar and
 * crossing spouse connectors).
 *
 * Cousins: explicit cousin_of is the source of truth for which spouse's
 * flank they occupy — never the spouse's parents' empty side.
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

/**
 * Drop parent-generation sibling bridges that contradict an explicit cousin_of.
 *
 * Example: Scott is cousin_of Kathy, but Scott’s mom was wrongly linked as
 * sibling of Jeff’s dad. That bridge would cluster Scott’s parents on Jeff’s
 * side — suppress it for layout so relational cousin_of wins.
 */
export function suppressSpouseSideCousinBridges(
  siblingAdj: Map<string, Set<string>>,
  partnerOf: ReadonlyMap<string, string>,
  parentsByChild: ReadonlyMap<string, readonly string[]>,
  cousinAdj: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  const unlink = (a: string, b: string) => {
    siblingAdj.get(a)?.delete(b);
    siblingAdj.get(b)?.delete(a);
  };

  const seen = new Set<string>();
  for (const [personId, cousins] of cousinAdj) {
    for (const cousinId of cousins) {
      const key =
        personId < cousinId
          ? `${personId}|${cousinId}`
          : `${cousinId}|${personId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const endpoints: Array<[string, string]> = [
        [personId, cousinId],
        [cousinId, personId],
      ];
      for (const [subjectId, otherId] of endpoints) {
        const spouseId = partnerOf.get(subjectId);
        if (!spouseId) continue;
        const cousinParents = parentsByChild.get(otherId) ?? [];
        const spouseParents = new Set(parentsByChild.get(spouseId) ?? []);
        if (cousinParents.length === 0 || spouseParents.size === 0) continue;
        for (const cp of cousinParents) {
          for (const sp of spouseParents) {
            if (siblingAdj.get(cp)?.has(sp)) unlink(cp, sp);
          }
        }
      }
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

/**
 * Unmarried cousins of `personId` on this generation — same outer-side
 * treatment as blood siblings. Never includes someone who already has a
 * spouse on this row (they stay in their own couple unit).
 */
export function outerCousinsOf(
  personId: string,
  idsOnRow: ReadonlySet<string>,
  ctx: LayoutIqContext,
  exclude: ReadonlySet<string>,
): string[] {
  if (!ctx.cousinAdj) return [];
  return [...(ctx.cousinAdj.get(personId) ?? [])]
    .filter(
      (id) =>
        !exclude.has(id) &&
        idsOnRow.has(id) &&
        !isCoupledOnRow(id, idsOnRow, ctx.partnerOf),
    )
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Blood siblings + unmarried cousins for a spouse's outer flank.
 * Cousins must use this path — never insert between spouses.
 */
export function outerRelativesOf(
  personId: string,
  idsOnRow: ReadonlySet<string>,
  ctx: LayoutIqContext,
  exclude: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [
    ...outerSiblingsOf(personId, idsOnRow, ctx, exclude),
    ...outerCousinsOf(personId, idsOnRow, ctx, exclude),
  ]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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
 * Everyone on this row who partners with `bloodId` (supports one-way /
 * multi-spouse maps where only one direction is mutual).
 */
export function spousesOnRowOf(
  bloodId: string,
  idSet: ReadonlySet<string>,
  partnerOf: ReadonlyMap<string, string>,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  const found = new Set<string>();
  const mutual = partnerOf.get(bloodId);
  if (mutual && idSet.has(mutual) && !exclude.has(mutual)) {
    found.add(mutual);
  }
  for (const [a, b] of partnerOf) {
    if (exclude.has(a) || !idSet.has(a)) continue;
    if (b === bloodId) found.add(a);
    if (a === bloodId && idSet.has(b) && !exclude.has(b)) found.add(b);
  }
  found.delete(bloodId);
  return [...found].sort((a, b) => a.localeCompare(b));
}

export type SiblingHousehold = {
  blood: string;
  spouses: readonly string[];
};

/**
 * Permanent sibling-block packing rule:
 * - Blood siblings form one contiguous spine (no in-law between two bloods).
 * - Spouses dock on the outer ends of that spine with their sibling —
 *   partnered households sit at the free ends so in-laws never sit between
 *   blood siblings.
 * - Units are ordered by the sibling, not by the spouse.
 *
 * `towardFocus: "right"` → block sits left of the focus (outer = left).
 * `towardFocus: "left"` → block sits right of the focus (outer = right).
 */
export function packSiblingHouseholdRow(
  households: readonly SiblingHousehold[],
  towardFocus: "left" | "right",
): string[] {
  if (households.length === 0) return [];

  const byId = (a: SiblingHousehold, b: SiblingHousehold) =>
    a.blood.localeCompare(b.blood);
  const partnered = households
    .filter((h) => h.spouses.length > 0)
    .slice()
    .sort(byId);
  const singles = households
    .filter((h) => h.spouses.length === 0)
    .slice()
    .sort(byId);

  /** Outer → inner (toward focus). Partnered claim the free ends. */
  let ordered: SiblingHousehold[];
  if (partnered.length === 0) {
    ordered = singles;
  } else if (partnered.length === 1) {
    ordered = [...partnered, ...singles];
  } else {
    const outerH = partnered[0]!;
    const innerH = partnered[partnered.length - 1]!;
    const midPartnered = partnered.slice(1, -1);
    ordered = [outerH, ...midPartnered, ...singles, innerH];
  }

  const spine = ordered.map((h) => h.blood);
  const outer = ordered[0]!;
  const inner = ordered[ordered.length - 1]!;

  const outerSpouses = [
    ...outer.spouses,
    ...ordered.slice(1, ordered.length - 1).flatMap((h) => [...h.spouses]),
  ];
  const innerSpouses =
    inner.blood !== outer.blood ? [...inner.spouses] : [];

  if (towardFocus === "right") {
    return [...outerSpouses, ...spine, ...innerSpouses];
  }
  return [...innerSpouses, ...spine, ...outerSpouses];
}

/**
 * Turn a packed sibling person row into layout units.
 */
export function unitsFromSiblingPersonRow(
  personIds: readonly string[],
  bloodSet: ReadonlySet<string>,
  partnerOf: ReadonlyMap<string, string>,
): LayoutUnit[] {
  const partnersBlood = (spouseId: string, bloodId: string) =>
    partnerOf.get(spouseId) === bloodId ||
    partnerOf.get(bloodId) === spouseId ||
    [...partnerOf.entries()].some(
      ([a, b]) =>
        (a === spouseId && b === bloodId) ||
        (a === bloodId && b === spouseId),
    );

  const units: LayoutUnit[] = [];
  let i = 0;
  while (i < personIds.length) {
    const id = personIds[i]!;
    if (!bloodSet.has(id)) {
      // Leading spouse rail before a blood end.
      const run: string[] = [];
      while (i < personIds.length && !bloodSet.has(personIds[i]!)) {
        run.push(personIds[i]!);
        i += 1;
      }
      const blood =
        i < personIds.length && bloodSet.has(personIds[i]!)
          ? personIds[i]!
          : null;
      if (blood && run.every((s) => partnersBlood(s, blood))) {
        units.push({
          ids: [...run, blood],
          isCouple: run.length === 1,
        });
        i += 1;
      } else {
        for (const s of run) units.push({ ids: [s], isCouple: false });
      }
      continue;
    }

    // Blood, optionally followed by docked spouses (inner end).
    const blood = id;
    const spouses: string[] = [];
    let j = i + 1;
    while (j < personIds.length && !bloodSet.has(personIds[j]!)) {
      spouses.push(personIds[j]!);
      j += 1;
    }
    if (spouses.length > 0 && spouses.every((s) => partnersBlood(s, blood))) {
      units.push({
        ids: [blood, ...spouses],
        isCouple: spouses.length === 1,
      });
      i = j;
    } else {
      units.push({ ids: [blood], isCouple: false });
      i += 1;
    }
  }
  return units;
}

/**
 * Build sibling-household layout units for a blood sibling set on a flank.
 */
export function siblingFlankUnits(input: {
  bloodIds: readonly string[];
  idSet: ReadonlySet<string>;
  partnerOf: ReadonlyMap<string, string>;
  exclude: ReadonlySet<string>;
  towardFocus: "left" | "right";
}): LayoutUnit[] {
  const bloodIds = [...input.bloodIds].filter(
    (id) => input.idSet.has(id) && !input.exclude.has(id),
  );
  if (bloodIds.length === 0) return [];

  const bloodSet = new Set(bloodIds);
  const excludeWithBlood = new Set([...input.exclude, ...bloodIds]);
  const households: SiblingHousehold[] = bloodIds.map((blood) => ({
    blood,
    spouses: spousesOnRowOf(
      blood,
      input.idSet,
      input.partnerOf,
      excludeWithBlood,
    ),
  }));

  const row = packSiblingHouseholdRow(households, input.towardFocus);
  return unitsFromSiblingPersonRow(row, bloodSet, input.partnerOf);
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
      // Siblings AND unmarried cousins of each spouse — never insert a
      // cousin between the couple (that parks them on the spouse's side).
      const leftOuter = outerRelativesOf(left, idSet, ctx, exclude).filter(
        (id) => !used.has(id),
      );
      const rightOuter = outerRelativesOf(right, idSet, ctx, exclude).filter(
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
      // Unmarried sibling/cousin cluster around this singleton.
      const cluster = [
        id,
        ...outerRelativesOf(id, idSet, ctx, new Set([id])).filter(
          (s) => !used.has(s),
        ),
      ];
      for (const member of cluster) take(member);
    }
  }

  for (const id of ids) take(id);
  return ordered;
}
