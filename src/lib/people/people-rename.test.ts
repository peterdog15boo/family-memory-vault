import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePeopleNames } from "@/lib/ai/resolve";
import {
  mergePersonNameAlias,
  normalizeNameAliases,
} from "@/lib/people/name-aliases";

describe("person name aliases", () => {
  it("keeps the old display name as an alias after rename", () => {
    const aliases = mergePersonNameAlias({
      currentName: "Craig Hale",
      nextName: "Craig",
      aliases: [],
    });
    expect(aliases).toEqual(["Craig Hale"]);
  });

  it("does not alias auto-generated Person N labels", () => {
    const aliases = mergePersonNameAlias({
      currentName: "Person 3",
      nextName: "Craig",
      aliases: [],
    });
    expect(aliases).toEqual([]);
  });

  it("does not store the current name as an alias", () => {
    const aliases = mergePersonNameAlias({
      currentName: "Craig Hale",
      nextName: "Craig",
      aliases: ["Craig Hale", "Craig"],
    });
    expect(aliases).toEqual(["Craig Hale"]);
  });

  it("strips blank and duplicate aliases", () => {
    expect(
      normalizeNameAliases(["  Craig Hale  ", "craig hale", "", "Person 1"]),
    ).toEqual(["Craig Hale"]);
  });
});

describe("rename a person; UI and Ask AI follow the new name", () => {
  it("Ask AI matches the old name and returns the current display name", () => {
    const aliases = mergePersonNameAlias({
      currentName: "Craig Hale",
      nextName: "Craig",
      aliases: [],
    });
    const catalog = [{ id: "craig", name: "Craig", aliases }];

    const byOldName = resolvePeopleNames(["Craig Hale"], catalog);
    expect(byOldName.matched).toHaveLength(1);
    expect(byOldName.matched[0]?.id).toBe("craig");
    expect(byOldName.matched[0]?.name).toBe("Craig");

    const byNewName = resolvePeopleNames(["Craig"], catalog);
    expect(byNewName.matched[0]?.id).toBe("craig");
    expect(byNewName.matched[0]?.name).toBe("Craig");
  });

  it("People detail applies the PATCH name immediately and refreshes other surfaces", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/people/PersonDetailView.tsx"),
      "utf8",
    );
    expect(src).toContain("await patchPerson({ name: trimmed })");
    expect(src).toContain("router.refresh()");
    expect(src).toContain("setNotice(t(\"people.nameSaved\"))");
  });
});
