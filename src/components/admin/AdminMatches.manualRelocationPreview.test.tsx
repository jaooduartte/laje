import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminMatches.tsx"),
  "utf8",
);

describe("AdminMatches manual relocation preview", () => {
  it("identifies the matchup, sport, naipe, official game number, and before-and-after times", () => {
    expect(componentSource).toContain("Jogo selecionado");
    expect(componentSource).toContain("Jogo reposicionado");
    expect(componentSource).toContain("Vai para a nova posição");
    expect(componentSource).toContain("Ocupa a vaga liberada");
    expect(componentSource).toContain("Antes");
    expect(componentSource).toContain("Depois");
    expect(componentSource).toContain("MATCH_NAIPE_LABELS[match.naipe]");
    expect(componentSource).toContain("Jogo {displayMatchNumber}");
    expect(componentSource).toContain("resolveKnockoutBracketMatchIdForMatch(");
  });

  it("does not repeat the full destination-court timeline in the preview", () => {
    const previewStart = componentSource.indexOf("{manualRelocationPreview ? (");
    const previewEnd = componentSource.indexOf("<DialogFooter>", previewStart);
    const manualRelocationPreviewSource = componentSource.slice(
      previewStart,
      previewEnd,
    );

    expect(manualRelocationPreviewSource).not.toContain(
      "Timeline da quadra de destino",
    );
    expect(manualRelocationPreviewSource).not.toContain(" • fila ");
  });
});
