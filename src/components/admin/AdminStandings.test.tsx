import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminStandings } from "@/components/admin/AdminStandings";
import {
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { Championship, ChampionshipBracketView, ChampionshipSport, Sport } from "@/lib/types";

const rankingsMock = {
  season_year: 2026,
  pending_matches_count: 0,
  top_scorers: [
    {
      player_id: "player-1",
      player_name: "Artilheiro 1",
      team_id: "team-1",
      team_name: "Atlética A",
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      goals: 5,
      team_advancement_rank: 0,
    },
  ],
  best_defenses: [
    {
      team_id: "team-defense-1",
      team_name: "Atlética Defesa",
      naipe: MatchNaipe.MASCULINO,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      matches_count: 4,
      goals_against: 4,
      goals_against_average: 1,
    },
  ],
  award_draw_results: [],
};

vi.mock("@/hooks/useStandings", () => ({
  useStandings: () => ({ standings: [], loading: false }),
}));

vi.mock("@/hooks/useMatches", () => ({
  useMatches: () => ({ matches: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipBracketResolvedTieBreakOrders", () => ({
  useChampionshipBracketResolvedTieBreakOrders: () => ({ resolvedTieBreakOrders: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipCorrectedGroupStandings", () => ({
  useChampionshipCorrectedGroupStandings: () => ({ correctedGroupStandings: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipBracketHistory", () => ({
  useChampionshipBracketHistory: () => ({ championshipBracketSeasonViews: [] }),
}));

vi.mock("@/hooks/useChampionshipAwardsRankings", async () => {
  const actualModule = await vi.importActual<typeof import("@/hooks/useChampionshipAwardsRankings")>(
    "@/hooks/useChampionshipAwardsRankings",
  );

  return {
    ...actualModule,
    useChampionshipAwardsRankings: () => ({
      rankings: rankingsMock,
      loading: false,
    }),
  };
});

vi.mock("@/components/TeamStandingsTable", () => ({
  TeamStandingsTable: () => <div>Standings table</div>,
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: () => <div>Sport filter</div>,
}));

describe("AdminStandings", () => {
  const selectedChampionship: Championship = {
    id: "championship-1",
    code: ChampionshipCode.SOCIETY,
    name: "Copa Laje Society",
    status: ChampionshipStatus.UPCOMING,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-06-18T00:00:00.000Z",
  };

  const sports: Sport[] = [
    {
      id: "sport-1",
      name: "Futebol Society",
      created_at: "2026-06-18T00:00:00.000Z",
      default_match_duration_minutes: 40,
    },
  ];

  const championshipSports: ChampionshipSport[] = [
    {
      id: "championship-sport-1",
      championship_id: selectedChampionship.id,
      sport_id: "sport-1",
      naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: true,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
      default_match_duration_minutes: 40,
      show_estimated_start_time_on_cards: true,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      created_at: "2026-06-18T00:00:00.000Z",
      walkover_winner_points: null,
      awards_include_knockout_phase: true,
      supports_individual_awards: true,
    },
  ];

  const championshipBracketView: ChampionshipBracketView = {
    edition: null,
    competitions: [],
  };

  beforeEach(() => {
    rankingsMock.top_scorers = [
      {
        player_id: "player-1",
        player_name: "Artilheiro 1",
        team_id: "team-1",
        team_name: "Atlética A",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 0,
      },
    ];
    rankingsMock.best_defenses = [
      {
        team_id: "team-defense-1",
        team_name: "Atlética Defesa",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        matches_count: 4,
        goals_against: 4,
        goals_against_average: 1,
      },
    ];
    rankingsMock.award_draw_results = [];
  });

  it("renderiza melhor defesa por atlética no admin", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    expect(screen.getByText("Melhores defesas")).toBeInTheDocument();
    expect(screen.getByText("Atlética Defesa")).toBeInTheDocument();
    expect(screen.getByText(/1,00 de média/)).toBeInTheDocument();
  });

  it("prioriza o artilheiro da equipe que avançou mais longe antes do sorteio", () => {
    rankingsMock.top_scorers = [
      {
        player_id: "player-final",
        player_name: "Artilheiro da Final",
        team_id: "team-final",
        team_name: "Atlética Finalista",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 3,
      },
      {
        player_id: "player-semi",
        player_name: "Artilheiro da Semi",
        team_id: "team-semi",
        team_name: "Atlética Semifinalista",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 2,
      },
    ];

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    const finalScorer = screen.getByText("Artilheiro da Final");
    const semifinalScorer = screen.getByText("Artilheiro da Semi");

    expect(finalScorer.compareDocumentPosition(semifinalScorer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
