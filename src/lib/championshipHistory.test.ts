import { describe, expect, it } from "vitest";
import { BracketThirdPlaceMode, MatchNaipe, MatchStatus } from "@/lib/enums";
import { resolveChampionshipChampionHistory } from "@/lib/championshipHistory";
import type {
  ChampionshipBracketCompetition,
  ChampionshipBracketKnockoutMatch,
  ChampionshipBracketSeasonView,
} from "@/lib/types";

function buildKnockoutMatch(
  overrides: Partial<ChampionshipBracketKnockoutMatch> & Pick<ChampionshipBracketKnockoutMatch, "id" | "round_number" | "slot_number">,
): ChampionshipBracketKnockoutMatch {
  return {
    id: overrides.id,
    round_number: overrides.round_number,
    slot_number: overrides.slot_number,
    match_id: overrides.match_id ?? overrides.id,
    status: overrides.status ?? MatchStatus.FINISHED,
    scheduled_date: overrides.scheduled_date ?? "2026-04-12",
    queue_position: overrides.queue_position ?? null,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    location: overrides.location ?? "Praia de Piçarras",
    court_name: overrides.court_name ?? null,
    home_team_id: overrides.home_team_id ?? null,
    away_team_id: overrides.away_team_id ?? null,
    home_team_name: overrides.home_team_name ?? null,
    away_team_name: overrides.away_team_name ?? null,
    winner_team_id: overrides.winner_team_id ?? null,
    winner_team_name: overrides.winner_team_name ?? null,
    is_bye: overrides.is_bye ?? false,
    is_third_place: overrides.is_third_place ?? false,
  };
}

function buildSeasonView(
  overrides: Partial<ChampionshipBracketCompetition>,
): ChampionshipBracketSeasonView {
  return {
    season_year: 2026,
    championship_bracket_view: {
      edition: null,
      competitions: [
        {
          id: overrides.id ?? "competition-1",
          sport_id: overrides.sport_id ?? "sport-1",
          sport_name: overrides.sport_name ?? "Beach Soccer",
          naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
          division: overrides.division ?? null,
          groups_count: overrides.groups_count ?? 2,
          qualifiers_per_group: overrides.qualifiers_per_group ?? 2,
          should_complete_knockout_with_best_second_placed_teams:
            overrides.should_complete_knockout_with_best_second_placed_teams ?? false,
          third_place_mode: overrides.third_place_mode ?? BracketThirdPlaceMode.NONE,
          groups: overrides.groups ?? [],
          knockout_matches: overrides.knockout_matches ?? [],
        },
      ],
    },
  };
}

describe("resolveChampionshipChampionHistory", () => {
  it("retorna campeão, vice e 3º lugar por partida explícita de terceiro lugar", () => {
    const history = resolveChampionshipChampionHistory([
      buildSeasonView({
        third_place_mode: BracketThirdPlaceMode.MATCH,
        knockout_matches: [
          buildKnockoutMatch({
            id: "final",
            round_number: 2,
            slot_number: 1,
            home_team_id: "team-a",
            home_team_name: "Equipe A",
            away_team_id: "team-b",
            away_team_name: "Equipe B",
            winner_team_id: "team-a",
            winner_team_name: "Equipe A",
          }),
          buildKnockoutMatch({
            id: "third-place",
            round_number: 2,
            slot_number: 2,
            home_team_id: "team-c",
            home_team_name: "Equipe C",
            away_team_id: "team-d",
            away_team_name: "Equipe D",
            winner_team_id: "team-c",
            winner_team_name: "Equipe C",
            is_third_place: true,
          }),
        ],
      }),
    ]);

    expect(history[0]?.champions[0]).toMatchObject({
      champion_team_name: "Equipe A",
      runner_up_team_name: "Equipe B",
      third_place_team_name: "Equipe C",
    });
  });

  it("retorna 3º lugar herdado do perdedor da semifinal contra o campeão", () => {
    const history = resolveChampionshipChampionHistory([
      buildSeasonView({
        third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
        knockout_matches: [
          buildKnockoutMatch({
            id: "semi-1",
            round_number: 1,
            slot_number: 1,
            home_team_id: "team-a",
            home_team_name: "Equipe A",
            away_team_id: "team-c",
            away_team_name: "Equipe C",
            winner_team_id: "team-a",
            winner_team_name: "Equipe A",
          }),
          buildKnockoutMatch({
            id: "semi-2",
            round_number: 1,
            slot_number: 2,
            home_team_id: "team-b",
            home_team_name: "Equipe B",
            away_team_id: "team-d",
            away_team_name: "Equipe D",
            winner_team_id: "team-b",
            winner_team_name: "Equipe B",
          }),
          buildKnockoutMatch({
            id: "final",
            round_number: 2,
            slot_number: 1,
            home_team_id: "team-a",
            home_team_name: "Equipe A",
            away_team_id: "team-b",
            away_team_name: "Equipe B",
            winner_team_id: "team-a",
            winner_team_name: "Equipe A",
          }),
        ],
      }),
    ]);

    expect(history[0]?.champions[0]?.third_place_team_name).toBe("Equipe C");
  });

  it("não retorna 3º lugar quando não existem dados suficientes", () => {
    const history = resolveChampionshipChampionHistory([
      buildSeasonView({
        third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
        knockout_matches: [
          buildKnockoutMatch({
            id: "final",
            round_number: 2,
            slot_number: 1,
            home_team_id: "team-a",
            home_team_name: "Equipe A",
            away_team_id: "team-b",
            away_team_name: "Equipe B",
            winner_team_id: "team-a",
            winner_team_name: "Equipe A",
          }),
        ],
      }),
    ]);

    expect(history[0]?.champions[0]?.third_place_team_name).toBeNull();
  });
});
