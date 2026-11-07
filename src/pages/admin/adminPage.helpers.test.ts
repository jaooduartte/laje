import { describe, expect, it } from "vitest";
import {
  resolvePreferredAdminChampionshipCode,
  resolveVisibleOperationalChampionshipBracketView,
} from "@/pages/admin/adminPage.helpers";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";
import { EMPTY_CHAMPIONSHIP_BRACKET_VIEW } from "@/lib/championship";
import type { Championship, ChampionshipBracketView } from "@/lib/types";

function buildChampionship(
  overrides: Partial<Championship> & Pick<Championship, "code">,
): Championship {
  return {
    id: overrides.id ?? overrides.code,
    code: overrides.code,
    name: overrides.name ?? overrides.code,
    status: overrides.status ?? ChampionshipStatus.PLANNING,
    current_season_year: overrides.current_season_year ?? 2026,
    uses_divisions: overrides.uses_divisions ?? false,
    default_location: overrides.default_location ?? null,
    created_at: overrides.created_at ?? "2026-05-08T00:00:00.000Z",
  };
}

describe("resolvePreferredAdminChampionshipCode", () => {
  it("prioriza o primeiro campeonato não encerrado na ordem CLV > SOCIETY > INTERLAJE", () => {
    const championships = [
      buildChampionship({ code: ChampionshipCode.INTERLAJE, status: ChampionshipStatus.PLANNING }),
      buildChampionship({ code: ChampionshipCode.CLV, status: ChampionshipStatus.FINISHED }),
      buildChampionship({ code: ChampionshipCode.SOCIETY, status: ChampionshipStatus.UPCOMING }),
    ];

    expect(resolvePreferredAdminChampionshipCode(championships)).toBe(ChampionshipCode.SOCIETY);
  });

  it("retorna CLV como fallback quando todos os campeonatos estão encerrados", () => {
    const championships = [
      buildChampionship({ code: ChampionshipCode.SOCIETY, status: ChampionshipStatus.FINISHED }),
      buildChampionship({ code: ChampionshipCode.INTERLAJE, status: ChampionshipStatus.FINISHED }),
      buildChampionship({ code: ChampionshipCode.CLV, status: ChampionshipStatus.FINISHED }),
    ];

    expect(resolvePreferredAdminChampionshipCode(championships)).toBe(ChampionshipCode.CLV);
  });
});

describe("resolveVisibleOperationalChampionshipBracketView", () => {
  it("mantém a edição ativa quando não há jogos na programação do dia", () => {
    const bracketView = {
      edition: {
        id: "edition-2027",
        payload_snapshot: { enabled_sport_ids: ["selected-sport"] },
      },
      competitions: [],
    } as unknown as ChampionshipBracketView;

    expect(resolveVisibleOperationalChampionshipBracketView(bracketView, 0)).toBe(bracketView);
  });

  it("usa a visão vazia quando não existem jogos nem edição carregada", () => {
    expect(
      resolveVisibleOperationalChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW, 0),
    ).toBe(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
  });
});
