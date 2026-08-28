/**
 * Heal orphan cousin nodes (e.g. Scott with no cousin_of edge) by writing
 * addCousin(subject, cousin) structure: cousin_of + subject-side parent bridge.
 *
 * Usage:
 *   npm run export:family-tree -- --userId=…   # inspect first
 *   npx tsx scripts/heal-orphan-cousin.ts --userId=user_xxx --subject=Kat --cousin=Scott --side=maternal
 */
import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (
    idx >= 0 &&
    process.argv[idx + 1] &&
    !process.argv[idx + 1]!.startsWith("--")
  ) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

async function main() {
  const userId = arg("userId")?.trim();
  const subjectLabel = arg("subject")?.trim() || "Kat";
  const cousinLabel = arg("cousin")?.trim() || "Scott";
  const sideRaw = arg("side")?.trim() || "maternal";
  const side =
    sideRaw === "paternal" || sideRaw === "unknown" || sideRaw === "maternal"
      ? sideRaw
      : "maternal";

  if (!userId) {
    console.error(
      "Usage: npx tsx scripts/heal-orphan-cousin.ts --userId=user_xxx [--subject=Kat] [--cousin=Scott] [--side=maternal]",
    );
    process.exit(1);
  }

  const { getFamilyTreeGraph, createFamilyTreeRelationshipWithScaffold } =
    await import("@/lib/family-tree/index");
  const { runGenealogyCommand } = await import("@/lib/family-tree/engine");

  const before = await getFamilyTreeGraph(userId, { skipRepair: true });
  const subject = before.nodes.find(
    (n) =>
      norm(n.label).includes(norm(subjectLabel)) ||
      norm(n.person?.displayName ?? "").includes(norm(subjectLabel)),
  );
  const cousin = before.nodes.find(
    (n) =>
      norm(n.label).includes(norm(cousinLabel)) ||
      norm(n.person?.displayName ?? "").includes(norm(cousinLabel)),
  );

  if (!subject || !cousin) {
    console.error("Could not find subject/cousin nodes", {
      subjectLabel,
      cousinLabel,
      labels: before.nodes.map((n) => n.label),
    });
    process.exit(1);
  }

  const existingCousin = before.relationships.some(
    (r) =>
      r.type === "cousin_of" &&
      ((r.fromNodeId === subject.id && r.toNodeId === cousin.id) ||
        (r.fromNodeId === cousin.id && r.toNodeId === subject.id)),
  );

  if (existingCousin) {
    console.error("cousin_of already exists — running repairTree instead");
    const repaired = await runGenealogyCommand(userId, { type: "repairTree" });
    if (repaired.ok) {
      console.error("repairTree ok", repaired.tree.repair);
    }
    process.exit(0);
  }

  console.error(
    `Linking cousin_of: subject=${subject.label}(${subject.id}) ↔ cousin=${cousin.label}(${cousin.id}) side=${side}`,
  );

  const result = await createFamilyTreeRelationshipWithScaffold({
    userId,
    fromNodeId: subject.id,
    toNodeId: cousin.id,
    type: "cousin_of",
    cousinSide: side,
    cousinSubjectId: subject.id,
  });

  const after = await getFamilyTreeGraph(userId, { skipRepair: true });
  const scott = after.nodes.find((n) => n.id === cousin.id);
  const kat = after.nodes.find((n) => n.id === subject.id);
  const parents = after.relationships.filter(
    (r) => r.type === "parent_of" && r.toNodeId === cousin.id,
  );
  const cousinEdge = after.relationships.filter(
    (r) =>
      r.type === "cousin_of" &&
      (r.fromNodeId === cousin.id || r.toNodeId === cousin.id),
  );

  console.error(
    JSON.stringify(
      {
        relationshipId: result.relationship.id,
        scaffoldMessage: result.scaffold.message,
        cousinGeneration: scott ? after.generations[scott.id] : null,
        subjectGeneration: kat ? after.generations[kat.id] : null,
        parentCount: parents.length,
        cousinEdges: cousinEdge.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
