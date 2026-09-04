import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/championship-brackets/ChampionshipBracketBoard.tsx",
  ),
  "utf8",
);

describe("ChampionshipBracketBoard", () => {
  it("does not render an unnecessary naipe filter in the public knockout board", () => {
    expect(componentSource).not.toContain("Todos os naipes");
    expect(componentSource).not.toContain('placeholder="Filtrar naipe"');
    expect(componentSource).not.toContain("naipeFilter");
    expect(componentSource).not.toContain("availableNaipeOptions");
  });

  it("keeps the division filter when the championship uses divisions", () => {
    expect(componentSource).toContain("Todas as divisões");
    expect(componentSource).toContain("availableDivisions.length > 0");
  });
});
