import { describe, expect, it } from "vitest";
import { resolveInterlajePlacementVisualBadges } from "@/domain/interlaje/interlajePlacementBadges";

describe("resolveInterlajePlacementVisualBadges", () => {
  it("explica a colocação de uma eliminada nas quartas pelo campeão", () => {
    const badges = resolveInterlajePlacementVisualBadges({
      placement_context: {
        stage: "QUARTERFINAL",
        status: "CONFIRMED",
        reason: "QUARTERFINAL_LOSS_TO_CHAMPION",
        final_position: 5,
        is_knockout_participant: true,
        eliminated_by_team_name: "AAASF",
        eliminated_by_final_position: 1,
      },
    });

    expect(badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Quartas" }),
        expect.objectContaining({
          label: "Eliminada por AAASF (campeã)",
        }),
      ]),
    );
  });

  it("identifica projeções e eliminações na fase de grupos", () => {
    const badges = resolveInterlajePlacementVisualBadges({
      placement_context: {
        stage: "GROUP_STAGE",
        status: "PROJECTED",
        reason: "GROUP_STAGE_ELIMINATION",
        final_position: 9,
        is_knockout_participant: false,
      },
    });

    expect(badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Fase de grupos" }),
        expect.objectContaining({ label: "Eliminada na fase de grupos" }),
        expect.objectContaining({ label: "Colocação projetada" }),
      ]),
    );
  });

  it("não cria badge fora do contexto do INTERLAJE", () => {
    expect(resolveInterlajePlacementVisualBadges(undefined)).toEqual([]);
    expect(resolveInterlajePlacementVisualBadges({})).toEqual([]);
  });
});
