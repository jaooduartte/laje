import { describe, expect, it } from "vitest";
import { ChampionshipSportResultRule, ChampionshipSportTieBreakerRule } from "@/lib/enums";
import { resolveModalidadeConfigByChampionshipSport } from "@/lib/modalidadeConfig";
import type { ChampionshipSport } from "@/lib/types";

describe("resolveModalidadeConfigByChampionshipSport", () => {
  it("usa a regra de desempate configurada fora do INTERLAJE", () => {
    const config = resolveModalidadeConfigByChampionshipSport(
      {
        sport_id: "sport-1",
        tie_breaker_rule: ChampionshipSportTieBreakerRule.HANDEBOL,
      } as ChampionshipSport,
      [{ id: "sport-1", name: "Handebol", created_at: "" }],
      null,
    );

    expect(config.display_columns).toEqual([
      "J",
      "V",
      "E",
      "D",
      "2M",
      "CA",
      "CV",
      "CAZ",
      "GC",
      "SG",
      "PTS",
    ]);
  });

  it("prioriza as métricas mensuráveis da política oficial do voleibol", () => {
    const championshipSport = {
      sport_id: "sport-1",
      result_rule: ChampionshipSportResultRule.SETS,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
      classification_policy: {
        criteria: [
          "POINTS",
          "SETS_AVERAGE",
          "HEAD_TO_HEAD_EXACTLY_TWO",
          "SETS_FOR",
          "RALLY_POINTS_FOR",
          "SETS_AGAINST_ASC",
          "RALLY_POINTS_AGAINST_ASC",
          "RED_CARDS_ASC",
          "YELLOW_CARDS_ASC",
          "MANUAL_DRAW",
        ],
      },
    } as ChampionshipSport;

    const config = resolveModalidadeConfigByChampionshipSport(
      championshipSport,
      [{ id: "sport-1", name: "Voleibol", created_at: "" }],
      null,
    );

    expect(config.display_columns).toEqual([
      "J",
      "V",
      "E",
      "D",
      "CA",
      "CV",
      "PC",
      "SP",
      "SV",
      "PR",
      "PA",
      "SA",
      "PTS",
    ]);
  });
});
