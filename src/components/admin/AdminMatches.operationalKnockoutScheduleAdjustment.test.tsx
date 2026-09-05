import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminMatches.tsx"),
  "utf8",
);

describe("AdminMatches operational knockout schedule adjustment", () => {
  it("offers the operation from scheduled knockout games and placeholders", () => {
    expect(componentSource).toContain("Ajustar programação futura");
    expect(componentSource).toContain("onAdjustSchedule");
    expect(componentSource).toContain(
      "resolveKnockoutBracketMatchIdForMatch",
    );
  });

  it("loads only selectable candidates and lets the administrator choose multiple items", () => {
    expect(componentSource).toContain(
      "listOperationalKnockoutScheduleAdjustmentCandidates",
    );
    expect(componentSource).toContain(
      "selectedOperationalKnockoutScheduleAdjustmentItemIds",
    );
    expect(componentSource).toContain(
      "handleToggleOperationalKnockoutScheduleAdjustmentItem",
    );
  });

  it("requires preview before applying duration and interval changes", () => {
    expect(componentSource).toContain("Duração comum dos selecionados");
    expect(componentSource).toContain("Manter intervalo");
    expect(componentSource).toContain("Remover intervalo");
    expect(componentSource).toContain("Criar ou editar intervalo");
    expect(componentSource).toContain(
      "previewOperationalKnockoutScheduleAdjustment",
    );
    expect(componentSource).toContain(
      "applyOperationalKnockoutScheduleAdjustment",
    );
    expect(componentSource).toContain("accept_day_end_extension");
    expect(componentSource).toContain("item.sport_name");
    expect(componentSource).toContain("MATCH_NAIPE_LABELS[item.naipe]");
  });

  it("keeps the action unavailable without edit permission or during score-sheet review", () => {
    expect(componentSource).toContain("!canManageMatches || isScoreSheetReviewMode");
    expect(componentSource).toContain("canManageMatches && !isScoreSheetReviewMode");
  });
});
