import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminMatches.tsx"),
  "utf8",
);

describe("AdminMatches manual relocation slot flow", () => {
  it("offers the individual action only to scheduled matches", () => {
    expect(componentSource).toContain('match.status === MatchStatus.SCHEDULED');
    expect(componentSource).toContain("Encaixar em horário livre");
    expect(componentSource).toContain("handleOpenManualRelocationSlotDialog(match)");
  });

  it("renders slot cards before the blocking confirmation preview", () => {
    expect(componentSource).toContain("Buscar horários");
    expect(componentSource).toContain("Horários disponíveis");
    expect(componentSource).toContain("Calcular prévia");
    expect(componentSource).toContain("Confirmar encaixe");
  });

  it("identifies displaced planned slots in both relocation previews", () => {
    expect(componentSource).toContain(
      "slots planejados posteriores podem ser reposicionados",
    );
    expect(componentSource).toContain(
      "A prévia também mostra os slots planejados que serão",
    );
    expect(componentSource).toContain("Slot planejado reposicionado");
    expect(componentSource).toContain("displaced_placeholders_count");
  });
});
