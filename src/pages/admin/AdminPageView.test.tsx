import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPageView } from "@/pages/admin/AdminPageView";
import { AdminPanelTab, ChampionshipCode, ChampionshipSportNaipeMode, ChampionshipSportResultRule, ChampionshipSportTieBreakerRule, ChampionshipStatus, MatchNaipe, MatchStatus } from "@/lib/enums";
import type { Championship, ChampionshipBracketView, ChampionshipSport, Match, Team } from "@/lib/types";

vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header-mock" />,
}));

vi.mock("@/components/OnlineVisitorsBadge", () => ({
  OnlineVisitorsBadge: () => <div data-testid="online-visitors-badge-mock" />,
}));

vi.mock("@/components/online-visitors/OnlineVisitorsProvider", () => ({
  useOnlineVisitorsProviderContext: () => ({
    siteTotalOnlineVisitorsCount: 1,
  }),
}));

vi.mock("@/components/admin/AdminMatches", () => ({
  AdminMatches: ({ viewMode }: { viewMode?: string }) => (
    <div data-testid={`admin-matches-${viewMode ?? "DEFAULT"}`}>{viewMode ?? "DEFAULT"}</div>
  ),
}));

vi.mock("@/components/admin/AdminMatchControl", () => ({
  AdminMatchControl: () => <div data-testid="admin-control-mock" />,
}));

vi.mock("@/components/admin/AdminTeams", () => ({
  AdminTeams: () => <div data-testid="admin-teams-mock" />,
}));

vi.mock("@/components/admin/AdminSports", () => ({
  AdminSports: () => <div data-testid="admin-sports-mock" />,
}));

vi.mock("@/components/admin/AdminLeagueEvents", () => ({
  AdminLeagueEvents: () => <div data-testid="admin-events-mock" />,
}));

vi.mock("@/components/admin/AdminLinks", () => ({
  AdminLinks: () => <div data-testid="admin-links-mock" />,
}));

vi.mock("@/components/admin/AdminLogs", () => ({
  AdminLogs: () => <div data-testid="admin-logs-mock" />,
}));

vi.mock("@/components/admin/AdminUsers", () => ({
  AdminUsers: () => <div data-testid="admin-users-mock" />,
}));

vi.mock("@/components/admin/AdminAccount", () => ({
  AdminAccount: () => <div data-testid="admin-account-mock" />,
}));

vi.mock("@/components/admin/AdminPublicAccessSettings", () => ({
  AdminPublicAccessSettings: () => <div data-testid="admin-settings-mock" />,
}));

function buildChampionship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: overrides.id ?? "championship-1",
    code: overrides.code ?? ChampionshipCode.CLV,
    name: overrides.name ?? "Copa Laje de Verão",
    status: overrides.status ?? ChampionshipStatus.IN_PROGRESS,
    current_season_year: overrides.current_season_year ?? 2026,
    uses_divisions: overrides.uses_divisions ?? false,
    default_location: overrides.default_location ?? "Praia de Piçarras",
    created_at: overrides.created_at ?? "2026-03-01T00:00:00.000Z",
  };
}

function buildMatch(): Match {
  const homeTeam: Team = {
    id: "team-home",
    name: "CASA",
    city: "Joinville",
    division: null,
    created_at: "2026-03-01T00:00:00.000Z",
  };
  const awayTeam: Team = {
    id: "team-away",
    name: "VISITANTE",
    city: "Joinville",
    division: null,
    created_at: "2026-03-01T00:00:00.000Z",
  };

  return {
    id: "match-1",
    championship_id: "championship-1",
    season_year: 2026,
    division: null,
    naipe: MatchNaipe.MASCULINO,
    supports_cards: false,
    result_rule: ChampionshipSportResultRule.POINTS,
    sport_id: "sport-1",
    home_team_id: homeTeam.id,
    away_team_id: awayTeam.id,
    location: "Praia de Piçarras",
    court_name: null,
    scheduled_date: "2026-04-11",
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
    created_at: "2026-04-11T08:00:00.000Z",
    sports: {
      id: "sport-1",
      name: "Beach Soccer",
      created_at: "2026-03-01T00:00:00.000Z",
    },
    home_team: homeTeam,
    away_team: awayTeam,
    match_sets: [],
  };
}

function buildChampionshipSport(): ChampionshipSport {
  return {
    id: "championship-sport-1",
    championship_id: "championship-1",
    sport_id: "sport-1",
    naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: ChampionshipSportResultRule.POINTS,
    supports_cards: false,
    tie_breaker_rule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
    default_match_duration_minutes: 30,
    show_estimated_start_time_on_cards: false,
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    created_at: "2026-03-01T00:00:00.000Z",
  };
}

function buildBracketView(): ChampionshipBracketView {
  return {
    edition: null,
    competitions: [],
  };
}

describe("AdminPageView tabs", () => {
  it("mantém ordem de abas Jogos > Conferência de Súmula > Sorteios", () => {
    const championship = buildChampionship();
    const match = buildMatch();

    render(
      <AdminPageView
        championships={[championship]}
        selectedChampionship={championship}
        selectedChampionshipCode={championship.code}
        matches={[match]}
        matchesTabMatches={[match]}
        teams={[match.home_team!, match.away_team!]}
        sports={[match.sports!]}
        championshipSports={[buildChampionshipSport()]}
        liveAndScheduledMatches={[match]}
        championshipBracketView={buildBracketView()}
        matchesTabChampionshipBracketView={buildBracketView()}
        loadingChampionshipBracket={false}
        loadingMatchesTabChampionshipBracket={false}
        matchBracketContextByMatchId={{}}
        matchesTabMatchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        matchesTabMatchRepresentationByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        matchesTabEstimatedStartTimeByMatchId={{}}
        matchesFetching={false}
        matchesTabFetching={false}
        availableMatchSeasonYears={[2026]}
        selectedMatchesSeasonYear={2026}
        profileName="Admin"
        canViewMatchesTab
        canViewControlTab
        canViewTeamsTab={false}
        canViewSportsTab={false}
        canViewEventsTab={false}
        canViewLinksTab={false}
        canViewLogsTab={false}
        canViewUsersTab={false}
        canViewAccountTab={false}
        canViewStandingsTab={false}
        canViewSettingsTab={false}
        canViewScoreSheetReviewTab
        canViewTieBreaksTab
        canViewChampionshipStatus={false}
        canViewBracketSetupTab={false}
        canViewScheduleTab={false}
        canManageSchedule={false}
        canManageMatches
        canManageChampionshipStatus={false}
        canManageScoreboard
        canManageTeams={false}
        canManageSports={false}
        canManageLeagueEvents={false}
        canManageLinks={false}
        canManageUsers={false}
        canManageAccount={false}
        canManageSettings={false}
        activeTab={AdminPanelTab.MATCHES}
        onActiveTabChange={() => undefined}
        onBracketGenerated={async () => undefined}
        updatingChampionshipStatus={false}
        onChampionshipCodeChange={() => undefined}
        onChampionshipStatusChange={() => undefined}
        onSelectedMatchesSeasonYearChange={() => undefined}
        onSignOut={() => undefined}
        onRefetchMatches={() => undefined}
        onRefetchChampionshipBracket={() => undefined}
        onRefetchTeams={() => undefined}
        liveMatchesCount={0}
        pendingLeagueEventReservationsCount={0}
        pendingTieBreaksCount={0}
      />,
    );

    const tabLabels = screen.getAllByRole("tab").map((tab) => tab.textContent?.trim());
    const jogosTabIndex = tabLabels.findIndex((label) => label == "Jogos");
    const conferenciaTabIndex = tabLabels.findIndex((label) => label == "Conferência de Súmula");
    const sorteiosTabIndex = tabLabels.findIndex((label) => label == "Sorteios");

    expect(jogosTabIndex).toBeGreaterThanOrEqual(0);
    expect(conferenciaTabIndex).toBeGreaterThan(jogosTabIndex);
    expect(sorteiosTabIndex).toBeGreaterThan(conferenciaTabIndex);
  });

  it("exibe na aba de conferência o total de jogos encerrados ainda não revisados", () => {
    const championship = buildChampionship();
    const finishedPendingMatch = {
      ...buildMatch(),
      status: MatchStatus.FINISHED,
    };
    const reviewedMatch = {
      ...buildMatch(),
      id: "match-2",
      status: MatchStatus.FINISHED,
      is_score_sheet_reviewed: true,
    };
    const scheduledMatch = {
      ...buildMatch(),
      id: "match-3",
      status: MatchStatus.SCHEDULED,
    };

    render(
      <AdminPageView
        championships={[championship]}
        selectedChampionship={championship}
        selectedChampionshipCode={championship.code}
        matches={[finishedPendingMatch, reviewedMatch, scheduledMatch]}
        matchesTabMatches={[finishedPendingMatch]}
        teams={[finishedPendingMatch.home_team!, finishedPendingMatch.away_team!]}
        sports={[finishedPendingMatch.sports!]}
        championshipSports={[buildChampionshipSport()]}
        liveAndScheduledMatches={[scheduledMatch]}
        championshipBracketView={buildBracketView()}
        matchesTabChampionshipBracketView={buildBracketView()}
        loadingChampionshipBracket={false}
        loadingMatchesTabChampionshipBracket={false}
        matchBracketContextByMatchId={{}}
        matchesTabMatchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        matchesTabMatchRepresentationByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        matchesTabEstimatedStartTimeByMatchId={{}}
        matchesFetching={false}
        matchesTabFetching={false}
        availableMatchSeasonYears={[2026]}
        selectedMatchesSeasonYear={2026}
        profileName="Admin"
        canViewMatchesTab
        canViewControlTab={false}
        canViewTeamsTab={false}
        canViewSportsTab={false}
        canViewEventsTab={false}
        canViewLinksTab={false}
        canViewLogsTab={false}
        canViewUsersTab={false}
        canViewAccountTab={false}
        canViewStandingsTab={false}
        canViewSettingsTab={false}
        canViewScoreSheetReviewTab
        canViewTieBreaksTab={false}
        canViewChampionshipStatus={false}
        canViewBracketSetupTab={false}
        canViewScheduleTab={false}
        canManageSchedule={false}
        canManageMatches
        canManageChampionshipStatus={false}
        canManageScoreboard
        canManageTeams={false}
        canManageSports={false}
        canManageLeagueEvents={false}
        canManageLinks={false}
        canManageUsers={false}
        canManageAccount={false}
        canManageSettings={false}
        activeTab={AdminPanelTab.MATCHES}
        onActiveTabChange={() => undefined}
        onBracketGenerated={async () => undefined}
        updatingChampionshipStatus={false}
        onChampionshipCodeChange={() => undefined}
        onChampionshipStatusChange={() => undefined}
        onSelectedMatchesSeasonYearChange={() => undefined}
        onSignOut={() => undefined}
        onRefetchMatches={() => undefined}
        onRefetchChampionshipBracket={() => undefined}
        onRefetchTeams={() => undefined}
        liveMatchesCount={0}
        pendingLeagueEventReservationsCount={0}
        pendingTieBreaksCount={0}
      />,
    );

    expect(screen.getByRole("tab", { name: /Conferência de Súmula/i })).toHaveTextContent("1");
  });

  it("mantém Configurações como última aba mesmo quando Agenda está visível", () => {
    const championship = buildChampionship();
    const match = buildMatch();

    render(
      <AdminPageView
        championships={[championship]}
        selectedChampionship={championship}
        selectedChampionshipCode={championship.code}
        matches={[match]}
        matchesTabMatches={[match]}
        teams={[match.home_team!, match.away_team!]}
        sports={[match.sports!]}
        championshipSports={[buildChampionshipSport()]}
        liveAndScheduledMatches={[match]}
        championshipBracketView={buildBracketView()}
        matchesTabChampionshipBracketView={buildBracketView()}
        loadingChampionshipBracket={false}
        loadingMatchesTabChampionshipBracket={false}
        matchBracketContextByMatchId={{}}
        matchesTabMatchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        matchesTabMatchRepresentationByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        matchesTabEstimatedStartTimeByMatchId={{}}
        matchesFetching={false}
        matchesTabFetching={false}
        availableMatchSeasonYears={[2026]}
        selectedMatchesSeasonYear={2026}
        profileName="Admin"
        canViewMatchesTab
        canViewControlTab={false}
        canViewTeamsTab={false}
        canViewSportsTab={false}
        canViewEventsTab={false}
        canViewLinksTab
        canViewLogsTab={false}
        canViewUsersTab={false}
        canViewAccountTab={false}
        canViewStandingsTab={false}
        canViewSettingsTab
        canViewScoreSheetReviewTab={false}
        canViewTieBreaksTab={false}
        canViewChampionshipStatus={false}
        canViewBracketSetupTab={false}
        canViewScheduleTab
        canManageSchedule={false}
        canManageMatches
        canManageChampionshipStatus={false}
        canManageScoreboard
        canManageTeams={false}
        canManageSports={false}
        canManageLeagueEvents={false}
        canManageLinks={false}
        canManageUsers={false}
        canManageAccount={false}
        canManageSettings={false}
        activeTab={AdminPanelTab.MATCHES}
        onActiveTabChange={() => undefined}
        onBracketGenerated={async () => undefined}
        updatingChampionshipStatus={false}
        onChampionshipCodeChange={() => undefined}
        onChampionshipStatusChange={() => undefined}
        onSelectedMatchesSeasonYearChange={() => undefined}
        onSignOut={() => undefined}
        onRefetchMatches={() => undefined}
        onRefetchChampionshipBracket={() => undefined}
        onRefetchTeams={() => undefined}
        liveMatchesCount={0}
        pendingLeagueEventReservationsCount={0}
        pendingTieBreaksCount={0}
      />,
    );

    const tabLabels = screen.getAllByRole("tab").map((tab) => tab.textContent?.trim());

    expect(tabLabels.at(-2)).toBe("Agenda");
    expect(tabLabels.at(-1)).toBe("Configurações");
  });

  it("não exibe Classificação quando apenas Jogos está liberado", () => {
    const championship = buildChampionship();
    const match = buildMatch();

    render(
      <AdminPageView
        championships={[championship]}
        selectedChampionship={championship}
        selectedChampionshipCode={championship.code}
        matches={[match]}
        matchesTabMatches={[match]}
        teams={[match.home_team!, match.away_team!]}
        sports={[match.sports!]}
        championshipSports={[buildChampionshipSport()]}
        liveAndScheduledMatches={[match]}
        championshipBracketView={buildBracketView()}
        matchesTabChampionshipBracketView={buildBracketView()}
        loadingChampionshipBracket={false}
        loadingMatchesTabChampionshipBracket={false}
        matchBracketContextByMatchId={{}}
        matchesTabMatchBracketContextByMatchId={{}}
        matchRepresentationByMatchId={{}}
        matchesTabMatchRepresentationByMatchId={{}}
        estimatedStartTimeByMatchId={{}}
        matchesTabEstimatedStartTimeByMatchId={{}}
        matchesFetching={false}
        matchesTabFetching={false}
        availableMatchSeasonYears={[2026]}
        selectedMatchesSeasonYear={2026}
        profileName="Admin"
        canViewMatchesTab
        canViewControlTab={false}
        canViewTeamsTab={false}
        canViewSportsTab={false}
        canViewEventsTab={false}
        canViewLinksTab={false}
        canViewLogsTab={false}
        canViewUsersTab={false}
        canViewAccountTab={false}
        canViewStandingsTab={false}
        canViewSettingsTab={false}
        canViewScoreSheetReviewTab={false}
        canViewTieBreaksTab={false}
        canViewChampionshipStatus={false}
        canViewBracketSetupTab={false}
        canViewScheduleTab={false}
        canManageSchedule={false}
        canManageMatches
        canManageChampionshipStatus={false}
        canManageScoreboard
        canManageTeams={false}
        canManageSports={false}
        canManageLeagueEvents={false}
        canManageLinks={false}
        canManageUsers={false}
        canManageAccount={false}
        canManageSettings={false}
        activeTab={AdminPanelTab.MATCHES}
        onActiveTabChange={() => undefined}
        onBracketGenerated={async () => undefined}
        updatingChampionshipStatus={false}
        onChampionshipCodeChange={() => undefined}
        onChampionshipStatusChange={() => undefined}
        onSelectedMatchesSeasonYearChange={() => undefined}
        onSignOut={() => undefined}
        onRefetchMatches={() => undefined}
        onRefetchChampionshipBracket={() => undefined}
        onRefetchTeams={() => undefined}
        liveMatchesCount={0}
        pendingLeagueEventReservationsCount={0}
        pendingTieBreaksCount={0}
      />,
    );

    expect(screen.queryByRole("tab", { name: "Classificação" })).not.toBeInTheDocument();
  });
});
