import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChampionshipsPageView } from "@/pages/championships/ChampionshipsPageView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChampionshipCode, ChampionshipStatus, MatchNaipe, TeamDivision } from "@/lib/enums";
import type { ReactNode } from "react";
import type { Championship } from "@/lib/types";
import type { ChampionshipChampionYearGroup } from "@/lib/championshipHistory";
import type { ChampionshipAwardsRankings } from "@/hooks/useChampionshipAwardsRankings";

vi.mock("@/components/Header", () => ({
  Header: () => <div>Header</div>,
}));

vi.mock("@/components/MatchCard", () => ({
  MatchCard: () => <div>Match card</div>,
}));

vi.mock("@/components/TeamStandingsTable", () => ({
  TeamStandingsTable: () => <div>Standings table</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationTrigger: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: string;
  }) => <button type="button" data-value={value}>{children}</button>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("ChampionshipsPageView", () => {
  it("exibe melhor defesa por atlética na área pública", async () => {
    const championship: Championship = {
      id: "championship-1",
      code: ChampionshipCode.SOCIETY,
      name: "Copa Laje Society",
      status: ChampionshipStatus.FINISHED,
      current_season_year: 2026,
      uses_divisions: true,
      default_location: null,
      created_at: "2026-06-18T00:00:00.000Z",
    };

    const championshipChampionHistory: ChampionshipChampionYearGroup[] = [
      {
        year: "2026",
        champions: [
          {
            year: "2026",
            sport_id: "sport-1",
            sport_name: "Futebol Society",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            champion_team_name: "Atlética Campeã",
            runner_up_team_name: "Atlética Vice",
            third_place_team_name: null,
            match_id: "final-1",
          },
        ],
      },
    ];

    const awardsRankings: ChampionshipAwardsRankings = {
      season_year: 2026,
      pending_matches_count: 0,
      pending_award_contexts: [],
      top_scorers: [
        {
          player_id: "player-final",
          player_name: "Artilheiro da Final",
          team_id: "team-final",
          team_name: "Atlética Campeã",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          goals: 6,
          team_advancement_rank: 3,
        },
        {
          player_id: "player-semi",
          player_name: "Artilheiro da Semi",
          team_id: "team-semi",
          team_name: "Atlética Vice",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          goals: 6,
          team_advancement_rank: 2,
        },
      ],
      best_defenses: [
        {
          team_id: "team-1",
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

    render(
      <TooltipProvider>
        <ChampionshipsPageView
          isLoading={false}
          isStandingsLoading={false}
          championships={[championship]}
          selectedChampionship={championship}
          selectedChampionshipCode={ChampionshipCode.SOCIETY}
          selectedChampionshipIsFinished
          championshipCardImageByCode={{ [ChampionshipCode.SOCIETY]: "/society.svg" } as Record<ChampionshipCode, string>}
          sports={[]}
          nextMatches={[]}
          isNextMatchesFetching={false}
          standingsSportFilter="ALL"
          standingsNaipeFilter="ALL"
          standingsYearFilter="2026"
          standingsDivisionFilter="ALL"
          allStandingsSportFilter="ALL"
          allStandingsNaipeFilter="ALL"
          allStandingsDivisionFilter="ALL"
          selectedChampionshipHasDivisions
          filteredStandings={[]}
          isStandingsNaipeFilterLocked={false}
          standingsModalidadeConfig={undefined}
          teamFilter="ALL"
          yearFilter="ALL"
          groupFilter="ALL"
          allTeamFilter="ALL"
          allYearFilter="ALL"
          availableStandingsYears={["2026"]}
          historyGroupOptions={[]}
          historyTeams={[]}
          historyYears={["2026"]}
          filteredHistoryMatches={[]}
          isHistoryMatchesFetching={false}
          championshipChampionHistory={championshipChampionHistory}
          overallPodiumStandings={[]}
          awardsRankings={awardsRankings}
          awardsSeasonYear={2026}
          matchBracketContextByMatchId={{}}
          matchRepresentationByMatchId={{}}
          estimatedStartTimeByMatchId={{}}
          onSelectChampionshipCode={vi.fn()}
          onStandingsSportFilterChange={vi.fn()}
          onStandingsNaipeFilterChange={vi.fn()}
          onStandingsDivisionFilterChange={vi.fn()}
          onStandingsYearFilterChange={vi.fn()}
          onTeamFilterChange={vi.fn()}
          onYearFilterChange={vi.fn()}
          onGroupFilterChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Melhor defesa")).toBeInTheDocument();
    expect(screen.getByText(/Atlética Defesa/)).toBeInTheDocument();
    expect(screen.getByText(/1,00 de média/)).toBeInTheDocument();
    expect(screen.getByText("Artilheiro da Final")).toBeInTheDocument();
    expect(screen.queryByText("Artilheiro da Semi")).not.toBeInTheDocument();
  });

  it("exibe premiações de uma divisão sem bloquear por pendência de outro recorte", async () => {
    const championship: Championship = {
      id: "championship-1",
      code: ChampionshipCode.SOCIETY,
      name: "Copa Laje Society",
      status: ChampionshipStatus.IN_PROGRESS,
      current_season_year: 2026,
      uses_divisions: true,
      default_location: null,
      created_at: "2026-06-18T00:00:00.000Z",
    };

    const championshipChampionHistory: ChampionshipChampionYearGroup[] = [
      {
        year: "2026",
        champions: [
          {
            year: "2026",
            sport_id: "sport-1",
            sport_name: "Futebol Society",
            naipe: MatchNaipe.FEMININO,
            division: TeamDivision.DIVISAO_ACESSO,
            champion_team_name: "AGUA",
            runner_up_team_name: "AFA",
            third_place_team_name: "AMEN",
            match_id: "final-access-fem",
          },
        ],
      },
    ];

    const awardsRankings: ChampionshipAwardsRankings = {
      season_year: 2026,
      pending_matches_count: 2,
      pending_award_contexts: [
        {
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          pending_matches_count: 1,
        },
        {
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          pending_matches_count: 1,
        },
      ],
      top_scorers: [
        {
          player_id: "player-agua",
          player_name: "Aline das Graças",
          team_id: "team-agua",
          team_name: "AGUA",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_ACESSO,
          goals: 6,
          team_advancement_rank: 2,
        },
      ],
      best_defenses: [
        {
          team_id: "team-agua",
          team_name: "AGUA",
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_ACESSO,
          matches_count: 3,
          goals_against: 2,
          goals_against_average: 2 / 3,
        },
      ],
      award_draw_results: [],
    };

    render(
      <TooltipProvider>
        <ChampionshipsPageView
          isLoading={false}
          isStandingsLoading={false}
          championships={[championship]}
          selectedChampionship={championship}
          selectedChampionshipCode={ChampionshipCode.SOCIETY}
          selectedChampionshipIsFinished={false}
          championshipCardImageByCode={{ [ChampionshipCode.SOCIETY]: "/society.svg" } as Record<ChampionshipCode, string>}
          sports={[]}
          nextMatches={[]}
          isNextMatchesFetching={false}
          standingsSportFilter="ALL"
          standingsNaipeFilter="ALL"
          standingsYearFilter="2026"
          standingsDivisionFilter="ALL"
          allStandingsSportFilter="ALL"
          allStandingsNaipeFilter="ALL"
          allStandingsDivisionFilter="ALL"
          selectedChampionshipHasDivisions
          filteredStandings={[]}
          isStandingsNaipeFilterLocked={false}
          standingsModalidadeConfig={undefined}
          teamFilter="ALL"
          yearFilter="ALL"
          groupFilter="ALL"
          allTeamFilter="ALL"
          allYearFilter="ALL"
          availableStandingsYears={["2026"]}
          historyGroupOptions={[]}
          historyTeams={[]}
          historyYears={["2026"]}
          filteredHistoryMatches={[]}
          isHistoryMatchesFetching={false}
          championshipChampionHistory={championshipChampionHistory}
          overallPodiumStandings={[]}
          awardsRankings={awardsRankings}
          awardsSeasonYear={2026}
          matchBracketContextByMatchId={{}}
          matchRepresentationByMatchId={{}}
          estimatedStartTimeByMatchId={{}}
          onSelectChampionshipCode={vi.fn()}
          onStandingsSportFilterChange={vi.fn()}
          onStandingsNaipeFilterChange={vi.fn()}
          onStandingsDivisionFilterChange={vi.fn()}
          onStandingsYearFilterChange={vi.fn()}
          onTeamFilterChange={vi.fn()}
          onYearFilterChange={vi.fn()}
          onGroupFilterChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Aline das Graças")).toBeInTheDocument();
    expect(screen.getByText(/AGUA • 6 gols/)).toBeInTheDocument();
    expect(screen.getAllByText("AGUA").length).toBeGreaterThan(0);
    expect(screen.getByText(/0,67 de média/)).toBeInTheDocument();
    expect(screen.getByText(/2 gols sofridos/)).toBeInTheDocument();
  });
});
