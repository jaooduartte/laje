import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SchedulePageView } from "@/pages/schedule/SchedulePageView";
import { ChampionshipCode, ChampionshipStatus, MatchNaipe, MatchStatus } from "@/lib/enums";
import type { Championship, ChampionshipIndividualEvent, ChampionshipIndividualSession, Match } from "@/lib/types";

vi.mock("@/components/Header", () => ({
  Header: () => <div>Header</div>,
}));

vi.mock("@/components/MatchCard", () => ({
  MatchCard: ({ match }: { match: Match }) => <div>{match.id}</div>,
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: () => <div>Filtro de modalidades</div>,
}));

vi.mock("@/components/ui/app-pagination-controls", () => ({
  AppPaginationControls: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div>{`Pagina ${currentPage} de ${totalPages}`}</div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

function buildChampionship(): Championship {
  return {
    id: "championship-1",
    code: ChampionshipCode.INTERLAJE,
    name: "Interlaje",
    status: ChampionshipStatus.IN_PROGRESS,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

function buildMatch(id: string): Match {
  return {
    id,
    championship_id: "championship-1",
    season_year: 2026,
    division: null,
    naipe: MatchNaipe.MASCULINO,
    supports_cards: false,
    result_rule: null,
    sport_id: "sport-1",
    home_team_id: `${id}-home`,
    away_team_id: `${id}-away`,
    location: "Arena Central",
    court_name: "Quadra 1",
    scheduled_date: "2026-07-10",
    queue_position: 1,
    scheduled_slot: 1,
    current_set_home_score: null,
    current_set_away_score: null,
    is_walkover: false,
    walkover_loser_team_id: null,
    is_score_sheet_reviewed: false,
    resolved_tie_breaker_rule: null,
    resolved_tie_break_winner_team_id: null,
    start_time: null,
    end_time: null,
    status: MatchStatus.SCHEDULED,
    home_score: 0,
    home_yellow_cards: 0,
    home_red_cards: 0,
    away_score: 0,
    away_yellow_cards: 0,
    away_red_cards: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    sports: {
      id: "sport-1",
      name: "Beach Soccer",
      created_at: "2026-07-01T00:00:00.000Z",
    },
    home_team: {
      id: `${id}-home`,
      name: "Casa",
      city: "Joinville",
      division: null,
      created_at: "2026-07-01T00:00:00.000Z",
    },
    away_team: {
      id: `${id}-away`,
      name: "Visitante",
      city: "Joinville",
      division: null,
      created_at: "2026-07-01T00:00:00.000Z",
    },
    match_sets: [],
  };
}

describe("SchedulePageView", () => {
  it("mostra anos históricos reais e mantém filtros completos de local e quadra", () => {
    const championship = buildChampionship();

    render(
      <SchedulePageView
        isLoading={false}
        selectedChampionship={championship}
        championships={[championship]}
        selectedChampionshipCode={championship.code}
        selectedChampionshipHasDivisions
        teams={[]}
        sports={[]}
        sportFilter={null}
        naipeFilter={null}
        teamFilter={null}
        groupFilter={null}
        locationFilter={null}
        courtFilter={null}
        locationOptions={["Arena Central", "Ginásio 2"]}
        courtOptions={["Quadra 1", "Quadra 2"]}
        groupOptions={[]}
        divisionFilter="ALL_SCHEDULE_DIVISIONS_FILTER"
        statusFilter={MatchStatus.SCHEDULED}
        yearFilter="2026"
        availableSeasonYears={[2026, 2025]}
        orderedDates={["2026-07-10"]}
        groupedMatches={{ "2026-07-10": [buildMatch("scheduled-1")] }}
        matches={[buildMatch("scheduled-1")]}
        isMatchesFetching={false}
        matchesCurrentPage={1}
        matchesItemsPerPage={12}
        matchesTotalPages={1}
        matchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        visualQueuePositionByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        onChampionshipCodeChange={vi.fn()}
        onSportFilterChange={vi.fn()}
        onNaipeFilterChange={vi.fn()}
        onTeamFilterChange={vi.fn()}
        onGroupFilterChange={vi.fn()}
        onLocationFilterChange={vi.fn()}
        onCourtFilterChange={vi.fn()}
        onDivisionChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onYearFilterChange={vi.fn()}
        onMatchesPageChange={vi.fn()}
        onMatchesItemsPerPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("Arena Central")).toBeInTheDocument();
    expect(screen.getByText("Ginásio 2")).toBeInTheDocument();
    expect(screen.getByText("Quadra 2")).toBeInTheDocument();
  });

  it("exibe sessões individuais com slot oficial e total de provas vinculadas", () => {
    const championship = buildChampionship();

    render(
      <SchedulePageView
        isLoading={false}
        selectedChampionship={championship}
        championships={[championship]}
        selectedChampionshipCode={championship.code}
        selectedChampionshipHasDivisions
        teams={[]}
        sports={[]}
        sportFilter={null}
        naipeFilter={null}
        teamFilter={null}
        groupFilter={null}
        locationFilter={null}
        courtFilter={null}
        locationOptions={[]}
        courtOptions={[]}
        groupOptions={[]}
        divisionFilter="ALL_SCHEDULE_DIVISIONS_FILTER"
        statusFilter={MatchStatus.SCHEDULED}
        yearFilter="2026"
        availableSeasonYears={[2026]}
        orderedDates={[]}
        groupedMatches={{}}
        individualEvents={[
          {
            id: "event-1",
            session_id: "session-1",
          } as ChampionshipIndividualEvent,
        ]}
        individualSessions={[
          {
            id: "session-1",
            naipe: MatchNaipe.MASCULINO,
            scheduled_date: "2026-08-10",
            period: "MATUTINO",
            location_name: "Parque Aquático",
            court_name: "Piscina Olímpica",
            sports: {
              name: "Natação",
            },
          } as ChampionshipIndividualSession,
        ]}
        matches={[]}
        isMatchesFetching={false}
        matchesCurrentPage={1}
        matchesItemsPerPage={12}
        matchesTotalPages={1}
        matchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        visualQueuePositionByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        onChampionshipCodeChange={vi.fn()}
        onSportFilterChange={vi.fn()}
        onNaipeFilterChange={vi.fn()}
        onTeamFilterChange={vi.fn()}
        onGroupFilterChange={vi.fn()}
        onLocationFilterChange={vi.fn()}
        onCourtFilterChange={vi.fn()}
        onDivisionChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onYearFilterChange={vi.fn()}
        onMatchesPageChange={vi.fn()}
        onMatchesItemsPerPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Sessões Individuais")).toBeInTheDocument();
    expect(screen.getByText("Natação")).toBeInTheDocument();
    expect(screen.getByText("Parque Aquático • Piscina Olímpica")).toBeInTheDocument();
    expect(screen.getByText("1 provas oficiais vinculadas")).toBeInTheDocument();
    expect(screen.getByText(/Matutino/)).toBeInTheDocument();
  });

  it("exibe placeholder do mata-mata planejado como A definir na agenda pública", () => {
    const championship = buildChampionship();

    render(
      <SchedulePageView
        isLoading={false}
        selectedChampionship={championship}
        championships={[championship]}
        selectedChampionshipCode={championship.code}
        selectedChampionshipHasDivisions
        teams={[]}
        sports={[]}
        sportFilter={null}
        naipeFilter={null}
        teamFilter={null}
        groupFilter={null}
        locationFilter={null}
        courtFilter={null}
        locationOptions={["Arena Central"]}
        courtOptions={["Quadra 1"]}
        groupOptions={[]}
        divisionFilter="ALL_SCHEDULE_DIVISIONS_FILTER"
        statusFilter={MatchStatus.SCHEDULED}
        yearFilter="2026"
        availableSeasonYears={[2026]}
        orderedDates={["2026-08-19"]}
        groupedMatches={{ "2026-08-19": [] }}
        groupedKnockoutPlaceholdersByDate={{
          "2026-08-19": [
            {
              id: "placeholder-1",
              competition_id: "competition-1",
              sport_id: "sport-1",
              sport_name: "Futsal",
              naipe: MatchNaipe.FEMININO,
              division: null,
              round_number: 3,
              slot_number: 1,
              is_third_place: false,
              scheduled_date: "2026-08-19",
              queue_position: 1,
              scheduled_slot: 1,
              start_time: null,
              end_time: null,
              location: "Arena Central",
              court_name: "Quadra 1",
              stage_label: "Final",
            },
          ],
        }}
        individualEvents={[]}
        individualSessions={[]}
        matches={[]}
        isMatchesFetching={false}
        matchesCurrentPage={1}
        matchesItemsPerPage={12}
        matchesTotalPages={1}
        matchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        visualQueuePositionByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        onChampionshipCodeChange={vi.fn()}
        onSportFilterChange={vi.fn()}
        onNaipeFilterChange={vi.fn()}
        onTeamFilterChange={vi.fn()}
        onGroupFilterChange={vi.fn()}
        onLocationFilterChange={vi.fn()}
        onCourtFilterChange={vi.fn()}
        onDivisionChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onYearFilterChange={vi.fn()}
        onMatchesPageChange={vi.fn()}
        onMatchesItemsPerPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Futsal")).toBeInTheDocument();
    expect(screen.getAllByText("A definir")).toHaveLength(3);
    expect(screen.getByText("Representação: Final")).toBeInTheDocument();
    expect(screen.getByText("Arena Central • Quadra 1")).toBeInTheDocument();
  });
});
