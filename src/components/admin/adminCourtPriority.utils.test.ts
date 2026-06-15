import { describe, expect, it } from "vitest";
import { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  buildCourtPriorityPreferencesForMode,
  resolveCourtPriorityRank,
  resolveCourtPriorityMode,
  resolveDivisionOptionsBySportId,
  resolveNaipeOptionsBySportId,
} from "@/components/admin/adminCourtPriority.utils";

describe("adminCourtPriority utils", () => {
  it("deduplicates naipe options by sport", () => {
    expect(
      resolveNaipeOptionsBySportId([
        {
          id: "competition-1",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.MASCULINO,
          division: null,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
        {
          id: "competition-2",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.FEMININO,
          division: null,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
        {
          id: "competition-3",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
      ]),
    ).toEqual({
      "sport-1": [MatchNaipe.MASCULINO, MatchNaipe.FEMININO],
    });
  });

  it("deduplicates division options by sport", () => {
    expect(
      resolveDivisionOptionsBySportId([
        {
          id: "competition-1",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
        {
          id: "competition-2",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_ACESSO,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
        {
          id: "competition-3",
          sport_id: "sport-1",
          sport_name: "Futebol",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_ACESSO,
          groups_count: 2,
          qualifiers_per_group: 1,
          should_complete_knockout_with_best_second_placed_teams: false,
          third_place_mode: "NONE",
          groups: [],
          knockout_matches: [],
        },
      ]),
    ).toEqual({
      "sport-1": [TeamDivision.DIVISAO_PRINCIPAL, TeamDivision.DIVISAO_ACESSO],
    });
  });

  it("resolves mode as none when all courts are neutral", () => {
    expect(
      resolveCourtPriorityMode({
        entries: [
          { preferred_naipe: null, preferred_division: null },
          { preferred_naipe: null, preferred_division: null },
        ],
        usesDivisions: true,
      }),
    ).toBe("NONE");
  });

  it("resolves mode as naipe when only naipe priorities are present", () => {
    expect(
      resolveCourtPriorityMode({
        entries: [
          { preferred_naipe: MatchNaipe.MASCULINO, preferred_division: null },
          { preferred_naipe: MatchNaipe.FEMININO, preferred_division: null },
        ],
        usesDivisions: true,
      }),
    ).toBe("NAIPE");
  });

  it("resolves mode as division when only division priorities are present", () => {
    expect(
      resolveCourtPriorityMode({
        entries: [
          { preferred_naipe: null, preferred_division: TeamDivision.DIVISAO_PRINCIPAL },
          { preferred_naipe: null, preferred_division: TeamDivision.DIVISAO_ACESSO },
        ],
        usesDivisions: true,
      }),
    ).toBe("DIVISION");
  });

  it("builds alternating naipe preferences", () => {
    expect(
      buildCourtPriorityPreferencesForMode({
        entries: [
          { preferred_naipe: null, preferred_division: null },
          { preferred_naipe: null, preferred_division: null },
          { preferred_naipe: null, preferred_division: null },
        ],
        mode: "NAIPE",
        naipeOptions: [MatchNaipe.MASCULINO, MatchNaipe.FEMININO],
        divisionOptions: [],
      }),
    ).toEqual([
      { preferred_naipe: MatchNaipe.MASCULINO, preferred_division: null },
      { preferred_naipe: MatchNaipe.FEMININO, preferred_division: null },
      { preferred_naipe: MatchNaipe.MASCULINO, preferred_division: null },
    ]);
  });

  it("builds alternating division preferences", () => {
    expect(
      buildCourtPriorityPreferencesForMode({
        entries: [
          { preferred_naipe: MatchNaipe.MASCULINO, preferred_division: null },
          { preferred_naipe: MatchNaipe.FEMININO, preferred_division: null },
        ],
        mode: "DIVISION",
        naipeOptions: [],
        divisionOptions: [TeamDivision.DIVISAO_PRINCIPAL, TeamDivision.DIVISAO_ACESSO],
      }),
    ).toEqual([
      { preferred_naipe: null, preferred_division: TeamDivision.DIVISAO_PRINCIPAL },
      { preferred_naipe: null, preferred_division: TeamDivision.DIVISAO_ACESSO },
    ]);
  });

  it("treats conflicting division as divergent even when naipe matches", () => {
    expect(
      resolveCourtPriorityRank({
        matchNaipe: MatchNaipe.MASCULINO,
        matchDivision: TeamDivision.DIVISAO_ACESSO,
        preferredNaipe: MatchNaipe.MASCULINO,
        preferredDivision: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ).toBe(2);
  });

  it("keeps neutral courts after exact matches and before divergent ones", () => {
    expect(
      resolveCourtPriorityRank({
        matchNaipe: MatchNaipe.FEMININO,
        matchDivision: TeamDivision.DIVISAO_PRINCIPAL,
        preferredNaipe: null,
        preferredDivision: null,
      }),
    ).toBe(1);

    expect(
      resolveCourtPriorityRank({
        matchNaipe: MatchNaipe.FEMININO,
        matchDivision: TeamDivision.DIVISAO_PRINCIPAL,
        preferredNaipe: MatchNaipe.FEMININO,
        preferredDivision: null,
      }),
    ).toBe(0);
  });
});
