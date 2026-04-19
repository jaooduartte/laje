import { describe, expect, it } from "vitest";
import { ChampionshipBracketTieBreakContextType, MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  resolveIsTieBreakTeamOrderReady,
  resolveNormalizedTieBreakTeamOrder,
} from "@/components/admin/adminMatchesTieBreak.utils";
import type { ChampionshipBracketTieBreakPendingContext } from "@/domain/championship-brackets/championshipBracket.types";

function buildPendingTieBreakContext(): ChampionshipBracketTieBreakPendingContext {
  return {
    context_key: "context-1",
    competition_id: "competition-1",
    sport_name: "Beach Soccer",
    naipe: MatchNaipe.MASCULINO,
    division: TeamDivision.DIVISAO_PRINCIPAL,
    context_type: ChampionshipBracketTieBreakContextType.GROUP,
    group_id: "group-1",
    group_number: 1,
    qualification_rank: null,
    title: "Sorteio manual do Grupo A",
    description: "Empate total entre atléticas.",
    teams: [
      { team_id: "team-1", team_name: "Atlética 1" },
      { team_id: "team-2", team_name: "Atlética 2" },
      { team_id: "team-3", team_name: "Atlética 3" },
    ],
  };
}

describe("AdminMatches tie-break helpers", () => {
  it("normaliza a ordem para o tamanho do contexto preenchendo posições vazias", () => {
    const pendingTieBreakContext = buildPendingTieBreakContext();

    expect(resolveNormalizedTieBreakTeamOrder(pendingTieBreakContext, ["team-1"])).toEqual([
      "team-1",
      "",
      "",
    ]);
  });

  it("considera inválido quando a ordem está incompleta ou com time repetido", () => {
    const pendingTieBreakContext = buildPendingTieBreakContext();

    expect(resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, ["team-1", "", "team-3"])).toBe(false);
    expect(resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, ["team-1", "team-1", "team-3"])).toBe(false);
  });

  it("considera válido quando a ordem está completa e sem duplicidade", () => {
    const pendingTieBreakContext = buildPendingTieBreakContext();

    expect(resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, ["team-3", "team-1", "team-2"])).toBe(true);
  });
});
