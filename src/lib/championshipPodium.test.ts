import { describe, expect, it } from "vitest";
import { BracketThirdPlaceMode, MatchNaipe, MatchStatus } from "@/lib/enums";
import { ChampionshipThirdPlaceSource, resolveCompetitionPodium } from "@/lib/championshipPodium";
import type { ChampionshipBracketCompetition, ChampionshipBracketKnockoutMatch } from "@/lib/types";

function buildKnockoutMatch(
  overrides: Partial<ChampionshipBracketKnockoutMatch> &
    Pick<ChampionshipBracketKnockoutMatch, "id" | "round_number" | "slot_number">,
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

function buildCompetition(overrides: Partial<ChampionshipBracketCompetition>): ChampionshipBracketCompetition {
  return {
    id: overrides.id ?? "competition-1",
    sport_id: overrides.sport_id ?? "sport-1",
    sport_name: overrides.sport_name ?? "Beach Tennis",
    naipe: overrides.naipe ?? MatchNaipe.MISTO,
    division: overrides.division ?? null,
    groups_count: overrides.groups_count ?? 2,
    qualifiers_per_group: overrides.qualifiers_per_group ?? 2,
    should_complete_knockout_with_best_second_placed_teams:
      overrides.should_complete_knockout_with_best_second_placed_teams ?? false,
    third_place_mode: overrides.third_place_mode ?? BracketThirdPlaceMode.NONE,
    groups: overrides.groups ?? [],
    knockout_matches: overrides.knockout_matches ?? [],
  };
}

describe("resolveCompetitionPodium", () => {
  it("prioriza o vencedor da partida de 3º quando ela existe", () => {
    const competitionPodium = resolveCompetitionPodium(
      buildCompetition({
        third_place_mode: BracketThirdPlaceMode.MATCH,
        knockout_matches: [
          buildKnockoutMatch({
            id: "semi-1",
            round_number: 1,
            slot_number: 1,
            home_team_id: "team-1",
            home_team_name: "Time 1",
            away_team_id: "team-2",
            away_team_name: "Time 2",
            winner_team_id: "team-1",
            winner_team_name: "Time 1",
          }),
          buildKnockoutMatch({
            id: "semi-2",
            round_number: 1,
            slot_number: 2,
            home_team_id: "team-3",
            home_team_name: "Time 3",
            away_team_id: "team-4",
            away_team_name: "Time 4",
            winner_team_id: "team-3",
            winner_team_name: "Time 3",
          }),
          buildKnockoutMatch({
            id: "final",
            round_number: 2,
            slot_number: 1,
            home_team_id: "team-1",
            home_team_name: "Time 1",
            away_team_id: "team-3",
            away_team_name: "Time 3",
            winner_team_id: "team-1",
            winner_team_name: "Time 1",
          }),
          buildKnockoutMatch({
            id: "third-place",
            round_number: 2,
            slot_number: 2,
            home_team_id: "team-2",
            home_team_name: "Time 2",
            away_team_id: "team-4",
            away_team_name: "Time 4",
            winner_team_id: "team-4",
            winner_team_name: "Time 4",
            is_third_place: true,
          }),
        ],
      }),
    );

    expect(competitionPodium).not.toBeNull();
    expect(competitionPodium?.champion.team_id).toBe("team-1");
    expect(competitionPodium?.runner_up?.team_id).toBe("team-3");
    expect(competitionPodium?.third_place).toMatchObject({
      source: ChampionshipThirdPlaceSource.THIRD_PLACE_MATCH,
      source_match_id: "third-place",
      team: {
        team_id: "team-4",
      },
    });
  });

  it("herda 3º do perdedor da semifinal do campeão quando não há partida de 3º", () => {
    const competitionPodium = resolveCompetitionPodium(
      buildCompetition({
        third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
        knockout_matches: [
          buildKnockoutMatch({
            id: "semi-1",
            round_number: 1,
            slot_number: 1,
            home_team_id: "team-1",
            home_team_name: "Time 1",
            away_team_id: "team-2",
            away_team_name: "Time 2",
            winner_team_id: "team-1",
            winner_team_name: "Time 1",
          }),
          buildKnockoutMatch({
            id: "semi-2",
            round_number: 1,
            slot_number: 2,
            home_team_id: "team-3",
            home_team_name: "Time 3",
            away_team_id: "team-4",
            away_team_name: "Time 4",
            winner_team_id: "team-3",
            winner_team_name: "Time 3",
          }),
          buildKnockoutMatch({
            id: "final",
            round_number: 2,
            slot_number: 1,
            home_team_id: "team-1",
            home_team_name: "Time 1",
            away_team_id: "team-3",
            away_team_name: "Time 3",
            winner_team_id: "team-1",
            winner_team_name: "Time 1",
          }),
        ],
      }),
    );

    expect(competitionPodium?.third_place).toMatchObject({
      source: ChampionshipThirdPlaceSource.CHAMPION_SEMIFINAL_LOSER,
      source_match_id: "semi-1",
      team: {
        team_id: "team-2",
      },
    });
  });

  it("retorna null quando a final não está concluída", () => {
    const competitionPodium = resolveCompetitionPodium(
      buildCompetition({
        knockout_matches: [
          buildKnockoutMatch({
            id: "final",
            round_number: 1,
            slot_number: 1,
            status: MatchStatus.SCHEDULED,
            home_team_id: "team-1",
            home_team_name: "Time 1",
            away_team_id: "team-2",
            away_team_name: "Time 2",
            winner_team_id: null,
            winner_team_name: null,
          }),
        ],
      }),
    );

    expect(competitionPodium).toBeNull();
  });
});
