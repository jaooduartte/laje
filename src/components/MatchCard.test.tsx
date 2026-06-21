import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchCard } from "@/components/MatchCard";
import type { MatchBracketContext } from "@/lib/championship";
import { BracketPhase, ChampionshipCode, ChampionshipSportResultRule, ChampionshipStatus, MatchNaipe, MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: overrides.id ?? "match-1",
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division ?? null,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    supports_cards: overrides.supports_cards ?? true,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    sport_id: overrides.sport_id ?? "sport-1",
    home_team_id: overrides.home_team_id ?? "team-1",
    away_team_id: overrides.away_team_id ?? "team-2",
    location: overrides.location ?? "Quadra 1",
    court_name: overrides.court_name ?? null,
    scheduled_date: overrides.scheduled_date ?? "2026-06-21",
    queue_position: overrides.queue_position ?? 1,
    start_time: overrides.start_time ?? "2026-06-21T10:00:00.000Z",
    end_time: overrides.end_time ?? "2026-06-21T11:00:00.000Z",
    status: overrides.status ?? MatchStatus.FINISHED,
    home_score: overrides.home_score ?? 3,
    away_score: overrides.away_score ?? 0,
    home_penalty_score: overrides.home_penalty_score ?? null,
    away_penalty_score: overrides.away_penalty_score ?? null,
    home_yellow_cards: overrides.home_yellow_cards ?? 0,
    home_red_cards: overrides.home_red_cards ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    created_at: overrides.created_at ?? "2026-06-21T09:00:00.000Z",
    is_walkover: overrides.is_walkover ?? true,
    disqualification_id: overrides.disqualification_id ?? "disqualification-1",
    championships: overrides.championships ?? {
      id: "championship-1",
      code: ChampionshipCode.SOCIETY,
      name: "Copa Laje Society",
      status: ChampionshipStatus.IN_PROGRESS,
      current_season_year: 2026,
      uses_divisions: false,
      default_location: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    sports: overrides.sports ?? {
      id: "sport-1",
      name: "Futebol Society",
      created_at: "2026-01-01T00:00:00.000Z",
      default_match_duration_minutes: 40,
    },
    home_team: overrides.home_team ?? {
      id: "team-1",
      name: "Atlética A",
      city: "Joinville",
      division: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    away_team: overrides.away_team ?? {
      id: "team-2",
      name: "Atlética B",
      city: "Joinville",
      division: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    match_sets: overrides.match_sets ?? [],
  };
}

describe("MatchCard", () => {
  it("mostra o rótulo derivado de cancelamento por desclassificação", () => {
    render(<MatchCard match={buildMatch()} />);

    expect(screen.getByText("Cancelado por desclassificação")).toBeInTheDocument();
    expect(screen.getByText("W.O.")).toBeInTheDocument();
  });

  it("mostra o placar secundário de pênaltis em empate do mata-mata da Society", () => {
    const bracketContext: MatchBracketContext = {
      badgeLabel: "Semifinal",
      phase: BracketPhase.KNOCKOUT,
      stageLabel: "Semifinal",
    };

    render(
      <MatchCard
        match={buildMatch({
          status: MatchStatus.FINISHED,
          is_walkover: false,
          disqualification_id: null,
          home_score: 2,
          away_score: 2,
          home_penalty_score: 4,
          away_penalty_score: 3,
        })}
        bracketContext={bracketContext}
      />,
    );

    expect(screen.getByText("Pênaltis: (4 × 3)")).toBeInTheDocument();
  });
});
