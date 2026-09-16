import { describe, expect, it } from "vitest";
import { resolveInterlajeKnockoutPullAlongPositions } from "@/domain/interlaje/interlajeKnockoutPlacement";

describe("resolveInterlajeKnockoutPullAlongPositions", () => {
  it("reserva 1º-4º para uma chave que começa nas semifinais", () => {
    const positions = resolveInterlajeKnockoutPullAlongPositions({
      championTeamId: "A",
      runnerUpTeamId: "C",
      semifinalLosers: [
        { teamId: "B", eliminatedByTeamId: "A" },
        { teamId: "D", eliminatedByTeamId: "C" },
      ],
    });

    expect(Object.fromEntries(positions)).toEqual({
      A: 1,
      C: 2,
      B: 3,
      D: 4,
    });
  });

  it("encadeia os derrotados das quartas pelas posições finais dos eliminadores", () => {
    const positions = resolveInterlajeKnockoutPullAlongPositions({
      championTeamId: "A",
      runnerUpTeamId: "C",
      semifinalLosers: [
        { teamId: "B", eliminatedByTeamId: "A" },
        { teamId: "D", eliminatedByTeamId: "C" },
      ],
      quarterfinalLosers: [
        { teamId: "E", eliminatedByTeamId: "A" },
        { teamId: "G", eliminatedByTeamId: "C" },
        { teamId: "F", eliminatedByTeamId: "B" },
        { teamId: "H", eliminatedByTeamId: "D" },
      ],
    });

    expect(Object.fromEntries(positions)).toEqual({
      A: 1,
      C: 2,
      B: 3,
      D: 4,
      E: 5,
      G: 6,
      F: 7,
      H: 8,
    });
    expect(new Set(positions.values()).size).toBe(8);
  });
});
