import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminMatches } from "@/components/admin/AdminMatches";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import {
  ChampionshipBracketTieBreakContextType,
  BracketEditionStatus,
  BracketThirdPlaceMode,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import type {
  ChampionshipBracketEdition,
  Championship,
  ChampionshipBracketView,
  ChampionshipSport,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import type { ChampionshipCorrectedGroupStanding } from "@/domain/championship-brackets/championshipBracket.types";

type SupabaseUpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  method: "eq" | "in";
  ids: string[];
};

type SupabaseRpcCall = {
  functionName: string;
  payload: Record<string, unknown>;
};

const {
  supabaseUpdateCalls,
  supabaseRpcCalls,
  supabaseRpcResponses,
  shouldDelaySupabaseUpdate,
  resolveDelayedSupabaseUpdate,
  toastSuccessMock,
  toastErrorMock,
  fetchLocationTemplatesMock,
  fetchPendingTieBreaksMock,
  fetchCorrectedGroupStandingsMock,
  generateChampionshipKnockoutMock,
  saveMatchSetsMock,
  saveTieBreakResolutionMock,
  supabaseChannelMock,
} = vi.hoisted(() => ({
  supabaseUpdateCalls: [] as SupabaseUpdateCall[],
  supabaseRpcCalls: [] as SupabaseRpcCall[],
  supabaseRpcResponses: [] as Array<{ data: unknown; error: { code?: string; message: string } | null }>,
  shouldDelaySupabaseUpdate: { value: false },
  resolveDelayedSupabaseUpdate: { current: null as (() => void) | null },
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  fetchLocationTemplatesMock: vi.fn(),
  fetchPendingTieBreaksMock: vi.fn(),
  fetchCorrectedGroupStandingsMock: vi.fn(),
  generateChampionshipKnockoutMock: vi.fn(),
  saveMatchSetsMock: vi.fn(),
  saveTieBreakResolutionMock: vi.fn(),
  supabaseChannelMock: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
}));

supabaseChannelMock.on.mockImplementation(() => supabaseChannelMock);
supabaseChannelMock.subscribe.mockImplementation(() => supabaseChannelMock);

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: ({ onSelect }: { onSelect: (value: string | null) => void }) => (
    <button type="button" data-testid="sport-filter-mock" onClick={() => onSelect("sport-1")}>
      Filtrar modalidade
    </button>
  ),
}));

vi.mock("@/components/ui/app-pagination-controls", () => ({
  DEFAULT_PAGINATION_ITEMS_PER_PAGE: 15,
  AppPaginationControls: ({
    onPageChange,
    onItemsPerPageChange,
  }: {
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (itemsPerPage: number) => void;
  }) => (
    <div>
      <button type="button" data-testid="admin-matches-next-page" onClick={() => onPageChange(2)}>
        próxima página
      </button>
      <button type="button" data-testid="admin-matches-items-per-page" onClick={() => onItemsPerPageChange(30)}>
        itens por página
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div data-testid="dropdown-menu-root-mock">{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div data-testid="dropdown-menu-content-mock">{children}</div>,
  DropdownMenuSeparator: () => <hr data-testid="dropdown-menu-separator-mock" />,
  DropdownMenuItem: ({
    children,
    onSelect,
    className,
  }: {
    children: unknown;
    onSelect?: (event: Event) => void;
    className?: string;
  }) => (
    <button
      type="button"
      role="menuitem"
      className={className}
      onClick={(event) => {
        onSelect?.(event as unknown as Event);
      }}
    >
      {children as JSX.Element}
    </button>
  ),
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  fetchChampionshipBracketLocationTemplates: (...args: unknown[]) => fetchLocationTemplatesMock(...args),
  fetchChampionshipBracketPendingTieBreaks: (...args: unknown[]) => fetchPendingTieBreaksMock(...args),
  fetchChampionshipCorrectedGroupStandings: (...args: unknown[]) => fetchCorrectedGroupStandingsMock(...args),
  generateChampionshipKnockout: (...args: unknown[]) => generateChampionshipKnockoutMock(...args),
  saveMatchSets: (...args: unknown[]) => saveMatchSetsMock(...args),
  saveChampionshipBracketTieBreakResolution: (...args: unknown[]) => saveTieBreakResolutionMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => supabaseChannelMock,
    removeChannel: () => undefined,
    rpc: async (functionName: string, payload: Record<string, unknown>) => {
      supabaseRpcCalls.push({
        functionName,
        payload,
      });

      return supabaseRpcResponses.shift() ?? { data: null, error: null };
    },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, value: string) => {
          supabaseUpdateCalls.push({
            table,
            payload,
            method: "eq",
            ids: [value],
          });

          if (shouldDelaySupabaseUpdate.value) {
            await new Promise<void>((resolve) => {
              resolveDelayedSupabaseUpdate.current = resolve;
            });
          }

          return { error: null };
        },
        in: async (_column: string, values: string[]) => {
          supabaseUpdateCalls.push({
            table,
            payload,
            method: "in",
            ids: values,
          });

          if (shouldDelaySupabaseUpdate.value) {
            await new Promise<void>((resolve) => {
              resolveDelayedSupabaseUpdate.current = resolve;
            });
          }

          return { error: null };
        },
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
        in: async () => ({ error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "inserted-match" }, error: null }),
        }),
      }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
  };
}

function buildSport(overrides: Partial<Sport> & Pick<Sport, "id" | "name">): Sport {
  return {
    id: overrides.id,
    name: overrides.name,
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
  };
}

function buildMatch(overrides: Partial<Match> & Pick<Match, "id" | "sport_id" | "status">): Match {
  const homeTeam = overrides.home_team ?? buildTeam({ id: `${overrides.id}-home`, name: `${overrides.id}-Casa` });
  const awayTeam = overrides.away_team ?? buildTeam({ id: `${overrides.id}-away`, name: `${overrides.id}-Visitante` });

  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division === undefined ? TeamDivision.DIVISAO_PRINCIPAL : overrides.division,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    supports_cards: overrides.supports_cards ?? false,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    sport_id: overrides.sport_id,
    home_team_id: overrides.home_team_id ?? homeTeam.id,
    away_team_id: overrides.away_team_id ?? awayTeam.id,
    location: overrides.location ?? "Praia de Piçarras",
    court_name: overrides.court_name ?? null,
    scheduled_date: overrides.scheduled_date ?? "2026-04-11",
    queue_position: overrides.queue_position ?? 1,
    scheduled_slot: overrides.scheduled_slot ?? null,
    current_set_home_score: overrides.current_set_home_score ?? null,
    current_set_away_score: overrides.current_set_away_score ?? null,
    is_walkover: overrides.is_walkover ?? false,
    walkover_loser_team_id: overrides.walkover_loser_team_id ?? null,
    is_score_sheet_reviewed: overrides.is_score_sheet_reviewed ?? false,
    resolved_tie_breaker_rule: overrides.resolved_tie_breaker_rule ?? null,
    resolved_tie_break_winner_team_id: overrides.resolved_tie_break_winner_team_id ?? null,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    status: overrides.status,
    home_score: overrides.home_score ?? 0,
    home_yellow_cards: overrides.home_yellow_cards ?? 0,
    home_red_cards: overrides.home_red_cards ?? 0,
    away_score: overrides.away_score ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    created_at: overrides.created_at ?? "2026-04-11T08:00:00.000Z",
    group_number: overrides.group_number ?? null,
    championships: overrides.championships,
    sports: overrides.sports ?? buildSport({ id: overrides.sport_id, name: "Beach Soccer" }),
    home_team: homeTeam,
    away_team: awayTeam,
    match_sets: overrides.match_sets ?? [],
  };
}

function buildChampionshipSport(overrides: Partial<ChampionshipSport> & Pick<ChampionshipSport, "id" | "sport_id">): ChampionshipSport {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id,
    naipe_mode: overrides.naipe_mode ?? ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    supports_cards: overrides.supports_cards ?? true,
    tie_breaker_rule: overrides.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.BEACH_SOCCER,
    default_match_duration_minutes: overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards: overrides.show_estimated_start_time_on_cards ?? false,
    points_win: overrides.points_win ?? 3,
    points_draw: overrides.points_draw ?? 1,
    points_loss: overrides.points_loss ?? 0,
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
    championships: overrides.championships,
    sports: overrides.sports,
  };
}

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

function buildBracketView(overrides: Partial<ChampionshipBracketView> = {}): ChampionshipBracketView {
  return {
    edition: overrides.edition ?? null,
    competitions: overrides.competitions ?? [],
  };
}

function buildBracketEdition(overrides: Partial<ChampionshipBracketEdition> = {}): ChampionshipBracketEdition {
  return {
    id: overrides.id ?? "edition-1",
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    status: overrides.status ?? BracketEditionStatus.GROUPS_GENERATED,
    payload_snapshot: overrides.payload_snapshot ?? { schedule_days: [] },
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-01T00:00:00.000Z",
  };
}

function buildCorrectedGroupStanding(
  overrides: Partial<ChampionshipCorrectedGroupStanding> &
    Pick<ChampionshipCorrectedGroupStanding, "competition_id" | "group_id" | "group_number" | "team_id" | "team_name">,
): ChampionshipCorrectedGroupStanding {
  return {
    competition_id: overrides.competition_id,
    sport_id: overrides.sport_id ?? "sport-1",
    sport_name: overrides.sport_name ?? "Beach Soccer",
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    group_id: overrides.group_id,
    group_number: overrides.group_number,
    group_size: overrides.group_size ?? 4,
    team_id: overrides.team_id,
    team_name: overrides.team_name,
    wins: overrides.wins ?? 1,
    points_base: overrides.points_base ?? 3,
    correction_factor: overrides.correction_factor ?? 1,
    corrected_points: overrides.corrected_points ?? 3,
    goals_for: overrides.goals_for ?? 3,
    goals_against: overrides.goals_against ?? 1,
    goal_diff: overrides.goal_diff ?? 2,
    yellow_cards: overrides.yellow_cards ?? 0,
    red_cards: overrides.red_cards ?? 0,
    points_average: overrides.points_average ?? 3,
  };
}

function renderAdminMatches(params: {
  matches: Match[];
  viewMode?: AdminMatchesViewMode;
  bracketView?: ChampionshipBracketView;
}) {
  const onRefetch = vi.fn();
  const onRefetchChampionshipBracket = vi.fn();

  render(
    <AdminMatches
      matches={params.matches}
      teams={params.matches.flatMap((match) => [match.home_team!, match.away_team!])}
      championshipSports={[buildChampionshipSport({ id: "championship-sport-1", sport_id: "sport-1" })]}
      selectedChampionship={buildChampionship()}
      championshipBracketView={params.bracketView ?? buildBracketView()}
      loadingChampionshipBracket={false}
      matchBracketContextByMatchId={{}}
      matchRepresentationByMatchId={{}}
      estimatedStartTimeByMatchId={{}}
      isFetchingMatches={false}
      canManageMatches
      viewMode={params.viewMode ?? AdminMatchesViewMode.DEFAULT}
      onRefetch={onRefetch}
      onRefetchChampionshipBracket={onRefetchChampionshipBracket}
    />,
  );

  return {
    onRefetch,
    onRefetchChampionshipBracket,
  };
}

function getMatchCardContainerByTeamName(teamName: string): HTMLElement {
  const cardTitle = screen.getByText(teamName);
  const cardContainer = cardTitle.closest(".list-item-card");

  if (!cardContainer) {
    throw new Error(`Card do jogo não encontrado para o time ${teamName}.`);
  }

  return cardContainer as HTMLElement;
}

function clickFirstMenuItemInMatchCard(matchCardContainer: HTMLElement, itemName: string) {
  const menuItems = within(matchCardContainer).getAllByRole("menuitem", { name: itemName });
  fireEvent.click(menuItems[0]);
}

describe("AdminMatches score sheet review", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
    supabaseUpdateCalls.length = 0;
    supabaseRpcCalls.length = 0;
    supabaseRpcResponses.length = 0;
    shouldDelaySupabaseUpdate.value = false;
    resolveDelayedSupabaseUpdate.current = null;
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    fetchLocationTemplatesMock.mockReset();
    fetchPendingTieBreaksMock.mockReset();
    fetchCorrectedGroupStandingsMock.mockReset();
    generateChampionshipKnockoutMock.mockReset();
    saveMatchSetsMock.mockReset();
    saveTieBreakResolutionMock.mockReset();
    supabaseChannelMock.on.mockClear();
    supabaseChannelMock.subscribe.mockClear();

    fetchLocationTemplatesMock.mockResolvedValue({ data: [], error: null });
    fetchPendingTieBreaksMock.mockResolvedValue({ data: [], error: null });
    fetchCorrectedGroupStandingsMock.mockResolvedValue({ data: [], error: null });
    generateChampionshipKnockoutMock.mockResolvedValue({ data: null, error: null });
    saveMatchSetsMock.mockResolvedValue({ error: null });
    saveTieBreakResolutionMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    shouldDelaySupabaseUpdate.value = false;
    resolveDelayedSupabaseUpdate.current = null;
    vi.clearAllMocks();
  });

  it("exibe somente jogos encerrados na aba de conferência", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "finished-1",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_team: buildTeam({ id: "team-finished-home", name: "CAMALEÃO" }),
          away_team: buildTeam({ id: "team-finished-away", name: "RASANTE" }),
        }),
        buildMatch({
          id: "live-1",
          sport_id: "sport-1",
          status: MatchStatus.LIVE,
          home_team: buildTeam({ id: "team-live-home", name: "TAUROS" }),
          away_team: buildTeam({ id: "team-live-away", name: "RAPOSAS" }),
        }),
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("CAMALEÃO")).toBeInTheDocument();
    });

    expect(screen.queryByText("TAUROS")).not.toBeInTheDocument();
  });

  it("não mostra o campo visual fixo de status encerrados no modo conferência", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "finished-review-1",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_team: buildTeam({ id: "team-finished-review-home", name: "CASA REVIEW" }),
          away_team: buildTeam({ id: "team-finished-review-away", name: "VISITANTE REVIEW" }),
        }),
      ],
    });

    await screen.findByText("CASA REVIEW");

    expect(screen.queryByText("Encerrados")).not.toBeInTheDocument();
  });

  it("ordena jogos encerrados por data e número do jogo em ordem crescente", async () => {
    renderAdminMatches({
      matches: [
        buildMatch({
          id: "finished-slot-8",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          scheduled_date: "2026-04-11",
          queue_position: 8,
          end_time: "2026-04-11T14:00:00.000Z",
          home_team: buildTeam({ id: "team-slot-8-home", name: "TIME JOGO 8" }),
          away_team: buildTeam({ id: "team-slot-8-away", name: "ADV JOGO 8" }),
        }),
        buildMatch({
          id: "finished-slot-5",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          scheduled_date: "2026-04-11",
          queue_position: 5,
          end_time: "2026-04-11T10:00:00.000Z",
          home_team: buildTeam({ id: "team-slot-5-home", name: "TIME JOGO 5" }),
          away_team: buildTeam({ id: "team-slot-5-away", name: "ADV JOGO 5" }),
        }),
        buildMatch({
          id: "finished-slot-7",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          scheduled_date: "2026-04-11",
          queue_position: 7,
          end_time: "2026-04-11T12:00:00.000Z",
          home_team: buildTeam({ id: "team-slot-7-home", name: "TIME JOGO 7" }),
          away_team: buildTeam({ id: "team-slot-7-away", name: "ADV JOGO 7" }),
        }),
      ],
    });

    await screen.findByText("TIME JOGO 5");

    const renderedMarkup = document.body.innerHTML;
    expect(renderedMarkup.indexOf("TIME JOGO 5")).toBeLessThan(renderedMarkup.indexOf("TIME JOGO 7"));
    expect(renderedMarkup.indexOf("TIME JOGO 7")).toBeLessThan(renderedMarkup.indexOf("TIME JOGO 8"));
  });

  it("oculta jogos revisados ao ativar o filtro do ícone de olho", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "reviewed-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: true,
          home_team: buildTeam({ id: "team-reviewed-home", name: "REVISADO CASA" }),
          away_team: buildTeam({ id: "team-reviewed-away", name: "REVISADO VISITANTE" }),
        }),
        buildMatch({
          id: "pending-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: false,
          home_team: buildTeam({ id: "team-pending-home", name: "PENDENTE CASA" }),
          away_team: buildTeam({ id: "team-pending-away", name: "PENDENTE VISITANTE" }),
        }),
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("REVISADO CASA")).toBeInTheDocument();
      expect(screen.getByText("PENDENTE CASA")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Ocultar jogos já revisados"));

    expect(screen.queryByText("REVISADO CASA")).not.toBeInTheDocument();
    expect(screen.getByText("PENDENTE CASA")).toBeInTheDocument();
  });

  it("abre revisão de súmula e salva premiações antes de marcar como revisado", async () => {
    supabaseRpcResponses.push(
      { data: null, error: null },
      {
        data: {
          match_id: "match-1",
          home_team_id: "team-1-home",
          away_team_id: "team-1-away",
          required_home_goals: 0,
          required_away_goals: 0,
          is_walkover: false,
          home_players: [{ id: "home-player-1", name: "Goleiro Casa" }],
          away_players: [{ id: "away-player-1", name: "Goleiro Visitante" }],
          home_goals: [],
          away_goals: [],
          home_goalkeeper: null,
          away_goalkeeper: null,
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "match-1",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: false,
          home_team: buildTeam({ id: "team-1-home", name: "CASA 1" }),
          away_team: buildTeam({ id: "team-1-away", name: "VISITANTE 1" }),
        }),
      ],
    });

    const actionsButton = await screen.findByLabelText("Ações do jogo CASA 1 x VISITANTE 1");
    fireEvent.pointerDown(actionsButton);

    const matchCardContainer = getMatchCardContainerByTeamName("CASA 1");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Revisar súmula e premiações");

    expect(await screen.findByText("Revisão de súmula e premiações")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Goleiro - CASA 1" }));
    fireEvent.click(screen.getByText("Goleiro Casa"));

    fireEvent.click(screen.getByRole("combobox", { name: "Goleiro - VISITANTE 1" }));
    fireEvent.click(screen.getByText("Goleiro Visitante"));

    fireEvent.click(screen.getByRole("button", { name: "Salvar revisão" }));

    await waitFor(() => {
      expect(
        supabaseRpcCalls.some(
          (rpcCall) => rpcCall.functionName == "save_match_score_sheet_awards" && rpcCall.payload._match_id == "match-1",
        ),
      ).toBe(true);
    });

    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("marca em lote somente os jogos filtrados ao selecionar todos filtrados", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "match-filter-1",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_walkover: true,
          home_team: buildTeam({ id: "team-filter-1-home", name: "FILTER A" }),
          away_team: buildTeam({ id: "team-filter-1-away", name: "FILTER B" }),
        }),
        buildMatch({
          id: "match-filter-2",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_walkover: true,
          home_team: buildTeam({ id: "team-filter-2-home", name: "FILTER C" }),
          away_team: buildTeam({ id: "team-filter-2-away", name: "FILTER D" }),
        }),
        buildMatch({
          id: "match-other-sport",
          sport_id: "sport-2",
          status: MatchStatus.FINISHED,
          sports: buildSport({ id: "sport-2", name: "Futevôlei" }),
          home_team: buildTeam({ id: "team-other-home", name: "OUTRO A" }),
          away_team: buildTeam({ id: "team-other-away", name: "OUTRO B" }),
        }),
      ],
    });

    await screen.findByText("FILTER A");

    fireEvent.click(screen.getByTestId("sport-filter-mock"));

    const selectAllLabel = screen.getByText("Selecionar todos os jogos filtrados");
    const selectAllCheckboxButton = selectAllLabel.parentElement?.querySelector<HTMLElement>('[role="checkbox"]');
    expect(selectAllCheckboxButton).not.toBeNull();
    fireEvent.click(selectAllCheckboxButton as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "Marcar selecionados como revisados" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].method).toBe("in");
    expect([...supabaseUpdateCalls[0].ids].sort()).toEqual(["match-filter-1", "match-filter-2"]);
    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      is_score_sheet_reviewed: true,
    });
  });

  it("dispara refetch com showFetching ao trocar filtros", async () => {
    const { onRefetch } = renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "fetch-filter-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_team: buildTeam({ id: "team-fetch-filter-home", name: "FETCH FILTER CASA" }),
          away_team: buildTeam({ id: "team-fetch-filter-away", name: "FETCH FILTER VISITANTE" }),
        }),
      ],
    });

    onRefetch.mockClear();

    fireEvent.click(await screen.findByTestId("sport-filter-mock"));

    await waitFor(() => {
      expect(onRefetch).toHaveBeenCalledWith({ showFetching: true });
    });
  });

  it("dispara refetch com showFetching ao trocar paginação", async () => {
    const { onRefetch } = renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "fetch-pagination-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_team: buildTeam({ id: "team-fetch-pagination-home", name: "FETCH PAGE CASA" }),
          away_team: buildTeam({ id: "team-fetch-pagination-away", name: "FETCH PAGE VISITANTE" }),
        }),
      ],
    });

    onRefetch.mockClear();

    fireEvent.click(await screen.findByTestId("admin-matches-next-page"));

    await waitFor(() => {
      expect(onRefetch).toHaveBeenCalledWith({ showFetching: true });
    });

    onRefetch.mockClear();

    fireEvent.click(screen.getByTestId("admin-matches-items-per-page"));

    await waitFor(() => {
      expect(onRefetch).toHaveBeenCalledWith({ showFetching: true });
    });
  });

  it("exibe indicador visual de revisão no card do admin", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "reviewed-indicator",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: true,
          home_team: buildTeam({ id: "team-indicator-home", name: "INDICADOR CASA" }),
          away_team: buildTeam({ id: "team-indicator-away", name: "INDICADOR VISITANTE" }),
        }),
      ],
    });

    await waitFor(() => {
      expect(screen.getByTitle("Conferido com súmula")).toBeInTheDocument();
    });
  });

  it("mostra no menu as ações editar, trocar jogo e apagar no modo padrão", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "menu-actions-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          home_team: buildTeam({ id: "menu-actions-home", name: "MENU CASA" }),
          away_team: buildTeam({ id: "menu-actions-away", name: "MENU VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo MENU CASA x MENU VISITANTE"));

    const matchCardContainer = getMatchCardContainerByTeamName("MENU CASA");
    expect(within(matchCardContainer).getAllByRole("menuitem", { name: "Editar" }).length).toBeGreaterThan(0);
    expect(within(matchCardContainer).getAllByRole("menuitem", { name: "Trocar jogo" }).length).toBeGreaterThan(0);
    expect(within(matchCardContainer).getAllByRole("menuitem", { name: "Apagar" }).length).toBeGreaterThan(0);
  });

  it("mantém menu restrito no modo de conferência sem trocar/apagar", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "menu-review-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_team: buildTeam({ id: "menu-review-home", name: "REVIEW CASA" }),
          away_team: buildTeam({ id: "menu-review-away", name: "REVIEW VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo REVIEW CASA x REVIEW VISITANTE"));

    const matchCardContainer = getMatchCardContainerByTeamName("REVIEW CASA");
    expect(within(matchCardContainer).getAllByRole("menuitem", { name: "Editar" }).length).toBeGreaterThan(0);
    expect(within(matchCardContainer).queryAllByRole("menuitem", { name: "Trocar jogo" })).toHaveLength(0);
    expect(within(matchCardContainer).queryAllByRole("menuitem", { name: "Apagar" })).toHaveLength(0);
  });

  it("abre modal de troca e chama RPC para swap de fila", async () => {
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "swap-source-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          scheduled_date: "2026-04-12",
          queue_position: 1,
          scheduled_slot: 1,
          home_team: buildTeam({ id: "swap-source-home", name: "ORIGEM CASA" }),
          away_team: buildTeam({ id: "swap-source-away", name: "ORIGEM VISITANTE" }),
        }),
        buildMatch({
          id: "swap-target-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          scheduled_date: "2026-04-12",
          queue_position: 2,
          scheduled_slot: 2,
          home_team: buildTeam({ id: "swap-target-home", name: "CANDIDATO CASA" }),
          away_team: buildTeam({ id: "swap-target-away", name: "CANDIDATO VISITANTE" }),
        }),
        buildMatch({
          id: "swap-ineligible-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          scheduled_date: "2026-04-12",
          queue_position: 3,
          scheduled_slot: 3,
          home_team: buildTeam({ id: "swap-ineligible-home", name: "OUTRO CASA" }),
          away_team: buildTeam({ id: "swap-ineligible-away", name: "OUTRO VISITANTE" }),
        }),
      ],
    });

    supabaseRpcResponses.push({
      data: {
        source_match_id: "swap-source-match",
        target_match_id: "swap-target-match",
        source_previous_slot: 1,
        target_previous_slot: 2,
        source_next_slot: 2,
        target_next_slot: 1,
      },
      error: null,
    });

    const sourceCardTitle = await screen.findByText("ORIGEM CASA");
    const sourceCardContainer = sourceCardTitle.closest(".list-item-card");
    expect(sourceCardContainer).not.toBeNull();

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo ORIGEM CASA x ORIGEM VISITANTE"));
    clickFirstMenuItemInMatchCard(sourceCardContainer as HTMLElement, "Trocar jogo");

    expect(await screen.findByText("Trocar jogo na fila")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Selecionar jogo para troca de fila" }));
    expect((await screen.findAllByText("Jogo 2 • CANDIDATO CASA x CANDIDATO VISITANTE")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Jogo 3 • OUTRO CASA x OUTRO VISITANTE")).not.toBeInTheDocument();

    fireEvent.click((await screen.findAllByText("Jogo 2 • CANDIDATO CASA x CANDIDATO VISITANTE"))[0]);

    onRefetch.mockClear();
    onRefetchChampionshipBracket.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar troca" }));

    await waitFor(() => {
      expect(supabaseRpcCalls.length).toBe(1);
    });

    expect(supabaseRpcCalls[0]).toMatchObject({
      functionName: "swap_match_queue_slots",
      payload: {
        _source_match_id: "swap-source-match",
        _target_match_id: "swap-target-match",
      },
    });

    await waitFor(() => {
      expect(onRefetch).toHaveBeenCalled();
      expect(onRefetchChampionshipBracket).toHaveBeenCalled();
    });
  });

  it("abre confirmação ao salvar edição de jogo revisado e permite remover a revisão", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "reviewed-edit-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: true,
          home_team: buildTeam({ id: "team-reviewed-edit-home", name: "EDIT CASA" }),
          away_team: buildTeam({ id: "team-reviewed-edit-away", name: "EDIT VISITANTE" }),
        }),
      ],
    });

    const actionsButton = await screen.findByLabelText("Ações do jogo EDIT CASA x EDIT VISITANTE");
    fireEvent.pointerDown(actionsButton);
    const matchCardContainer = getMatchCardContainerByTeamName("EDIT CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Jogo já revisado na súmula")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar e remover revisão" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      is_score_sheet_reviewed: false,
    });
  });

  it("exige preencher autores dos gols antes de salvar a revisão", async () => {
    supabaseRpcResponses.push(
      { data: null, error: null },
      {
        data: {
          match_id: "review-loader-match",
          home_team_id: "team-review-loader-home",
          away_team_id: "team-review-loader-away",
          required_home_goals: 1,
          required_away_goals: 0,
          is_walkover: false,
          home_players: [{ id: "home-player-2", name: "Atacante Casa" }],
          away_players: [{ id: "away-player-2", name: "Goleira Visitante" }],
          home_goals: [],
          away_goals: [],
          home_goalkeeper: null,
          away_goalkeeper: null,
        },
        error: null,
      },
    );

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "review-loader-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: false,
          home_team: buildTeam({ id: "team-review-loader-home", name: "LOADER CASA" }),
          away_team: buildTeam({ id: "team-review-loader-away", name: "LOADER VISITANTE" }),
        }),
      ],
    });

    const card = await screen.findByText("LOADER CASA");
    const cardContainer = card.closest(".list-item-card");
    expect(cardContainer).not.toBeNull();

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo LOADER CASA x LOADER VISITANTE"));
    clickFirstMenuItemInMatchCard(cardContainer as HTMLElement, "Revisar súmula e premiações");

    expect(await screen.findByText("Revisão de súmula e premiações")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar revisão" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Preencha os autores de todos os gols antes de salvar.");
    });
  });

  it("executa reconciliação de mata-mata ao abrir a aba de conferência com edição ativa", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "catch-up-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: {
          id: "edition-1",
          championship_id: "championship-1",
          season_year: 2026,
          status: BracketEditionStatus.GROUPS_GENERATED,
          payload_snapshot: { schedule_days: [] },
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
        competitions: [],
      }),
    });

    await waitFor(() => {
      expect(generateChampionshipKnockoutMock).toHaveBeenCalledWith("championship-1", "edition-1");
    });
  });

  it("permite salvar sorteio individual por contexto na aba dedicada de sorteios", async () => {
    fetchPendingTieBreaksMock.mockResolvedValue({
      data: [
        {
          context_key: "context-group-f",
          competition_id: "competition-1",
          sport_name: "Beach Soccer",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          context_type: ChampionshipBracketTieBreakContextType.GROUP,
          group_id: "group-f",
          group_number: 6,
          qualification_rank: 2,
          title: "Sorteio manual do Grupo F",
          description: "Empate total entre Rasante e Camaleão.",
          teams: [
            { team_id: "team-rasante", team_name: "RASANTE" },
            { team_id: "team-camaleao", team_name: "CAMALEÃO" },
          ],
        },
      ],
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.TIE_BREAKS,
      matches: [
        buildMatch({
          id: "tie-break-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
    });

    await screen.findByText("Sorteio manual do Grupo F");

    fireEvent.click(screen.getByRole("button", { name: "Sortear ordem" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar sorteio" }));

    await waitFor(() => {
      expect(saveTieBreakResolutionMock).toHaveBeenCalledTimes(1);
      expect(generateChampionshipKnockoutMock).toHaveBeenCalledWith("championship-1", "edition-1");
    });

    const firstSavePayload = saveTieBreakResolutionMock.mock.calls[0]?.[0];
    expect(firstSavePayload).toMatchObject({
      context_key: "context-group-f",
      competition_id: "competition-1",
      context_type: ChampionshipBracketTieBreakContextType.GROUP,
      group_id: "group-f",
      qualification_rank: 2,
    });
    expect(Array.isArray(firstSavePayload?.team_ids)).toBe(true);
    expect(firstSavePayload?.team_ids).toHaveLength(2);
  });

  it("renderiza a tabela de métricas dentro do mesmo card de sorteio", async () => {
    fetchPendingTieBreaksMock.mockResolvedValue({
      data: [
        {
          context_key: "context-group-f-metrics",
          competition_id: "competition-1",
          sport_name: "Beach Soccer",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          context_type: ChampionshipBracketTieBreakContextType.GROUP,
          group_id: "group-f",
          group_number: 6,
          qualification_rank: 2,
          title: "Sorteio manual do Grupo F",
          description: "Empate total entre Rasante e Camaleão.",
          teams: [
            { team_id: "team-rasante", team_name: "RASANTE" },
            { team_id: "team-camaleao", team_name: "CAMALEÃO" },
          ],
        },
      ],
      error: null,
    });
    fetchCorrectedGroupStandingsMock.mockResolvedValue({
      data: [
        buildCorrectedGroupStanding({
          competition_id: "competition-1",
          group_id: "group-f",
          group_number: 6,
          team_id: "team-rasante",
          team_name: "RASANTE",
          corrected_points: 4,
          goals_for: 7,
          goals_against: 6,
          goal_diff: 1,
          yellow_cards: 2,
          red_cards: 0,
          wins: 1,
          points_average: 1.1666666,
        }),
        buildCorrectedGroupStanding({
          competition_id: "competition-1",
          group_id: "group-f",
          group_number: 6,
          team_id: "team-camaleao",
          team_name: "CAMALEÃO",
          corrected_points: 4,
          goals_for: 7,
          goals_against: 6,
          goal_diff: 1,
          yellow_cards: 1,
          red_cards: 0,
          wins: 1,
          points_average: 1.1666666,
        }),
        buildCorrectedGroupStanding({
          competition_id: "competition-1",
          group_id: "group-f",
          group_number: 6,
          team_id: "team-other",
          team_name: "OUTRA ATLÉTICA",
          corrected_points: 10,
        }),
      ],
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.TIE_BREAKS,
      matches: [
        buildMatch({
          id: "tie-break-match-metrics",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
    });

    const contextCardTitle = await screen.findByText("Sorteio manual do Grupo F");
    const contextCard = contextCardTitle.closest("div.glass-card");

    if (!contextCard) {
      throw new Error("Card do contexto de sorteio não encontrado.");
    }

    expect(screen.queryByText("Tabela auditável de pontuação corrigida")).not.toBeInTheDocument();
    expect(within(contextCard).getByText("Resultado atual do empate")).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "PTS (corr.)" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "PA" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "SG" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "CA" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "CV" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "GP" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "GC" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "V" })).toBeInTheDocument();
    expect(within(contextCard).getByText("RASANTE")).toBeInTheDocument();
    expect(within(contextCard).getByText("CAMALEÃO")).toBeInTheDocument();
    expect(within(contextCard).queryByText("OUTRA ATLÉTICA")).not.toBeInTheDocument();
  });

  it("salva apenas o contexto selecionado e mantém os demais pendentes", async () => {
    fetchPendingTieBreaksMock
      .mockResolvedValueOnce({
        data: [
          {
            context_key: "context-group-a",
            competition_id: "competition-1",
            sport_name: "Beach Soccer",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            context_type: ChampionshipBracketTieBreakContextType.GROUP,
            group_id: "group-a",
            group_number: 1,
            qualification_rank: null,
            title: "Sorteio manual do Grupo A",
            description: "Empate total entre Alpha e Beta.",
            teams: [
              { team_id: "team-alpha", team_name: "ALPHA" },
              { team_id: "team-beta", team_name: "BETA" },
            ],
          },
          {
            context_key: "context-group-b",
            competition_id: "competition-1",
            sport_name: "Beach Soccer",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            context_type: ChampionshipBracketTieBreakContextType.GROUP,
            group_id: "group-b",
            group_number: 2,
            qualification_rank: null,
            title: "Sorteio manual do Grupo B",
            description: "Empate total entre Gamma e Delta.",
            teams: [
              { team_id: "team-gamma", team_name: "GAMMA" },
              { team_id: "team-delta", team_name: "DELTA" },
            ],
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            context_key: "context-group-b",
            competition_id: "competition-1",
            sport_name: "Beach Soccer",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            context_type: ChampionshipBracketTieBreakContextType.GROUP,
            group_id: "group-b",
            group_number: 2,
            qualification_rank: null,
            title: "Sorteio manual do Grupo B",
            description: "Empate total entre Gamma e Delta.",
            teams: [
              { team_id: "team-gamma", team_name: "GAMMA" },
              { team_id: "team-delta", team_name: "DELTA" },
            ],
          },
        ],
        error: null,
      });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.TIE_BREAKS,
      matches: [
        buildMatch({
          id: "tie-break-match-list",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
    });

    const firstContextCardTitle = await screen.findByText("Sorteio manual do Grupo A");
    const firstContextCard = firstContextCardTitle.closest("div.glass-card");

    if (!firstContextCard) {
      throw new Error("Card do primeiro contexto de sorteio não encontrado.");
    }

    fireEvent.click(within(firstContextCard).getByRole("button", { name: "Sortear ordem" }));
    fireEvent.click(within(firstContextCard).getByRole("button", { name: "Salvar sorteio" }));

    await waitFor(() => {
      expect(saveTieBreakResolutionMock).toHaveBeenCalledTimes(1);
    });

    const firstSavePayload = saveTieBreakResolutionMock.mock.calls[0]?.[0];
    expect(firstSavePayload?.context_key).toBe("context-group-a");

    await waitFor(() => {
      expect(screen.queryByText("Sorteio manual do Grupo A")).not.toBeInTheDocument();
      expect(screen.getByText("Sorteio manual do Grupo B")).toBeInTheDocument();
    });
  });

  it("mantém o botão de salvar desabilitado quando a ordem do contexto está incompleta", async () => {
    fetchPendingTieBreaksMock.mockResolvedValue({
      data: [
        {
          context_key: "context-group-c",
          competition_id: "competition-1",
          sport_name: "Beach Soccer",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          context_type: ChampionshipBracketTieBreakContextType.GROUP,
          group_id: "group-c",
          group_number: 3,
          qualification_rank: null,
          title: "Sorteio manual do Grupo C",
          description: "Empate total entre Epsilon e Zeta.",
          teams: [
            { team_id: "team-epsilon", team_name: "EPSILON" },
            { team_id: "team-zeta", team_name: "ZETA" },
          ],
        },
      ],
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.TIE_BREAKS,
      matches: [
        buildMatch({
          id: "tie-break-match-disabled-save",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
    });

    const contextCardTitle = await screen.findByText("Sorteio manual do Grupo C");
    const contextCard = contextCardTitle.closest("div.glass-card");

    if (!contextCard) {
      throw new Error("Card do contexto de sorteio não encontrado.");
    }

    expect(within(contextCard).getByRole("button", { name: "Salvar sorteio" })).toBeDisabled();
  });

  it("em erro ao salvar um contexto não limpa o estado dos demais sorteios", async () => {
    fetchPendingTieBreaksMock.mockResolvedValue({
      data: [
        {
          context_key: "context-group-d",
          competition_id: "competition-1",
          sport_name: "Beach Soccer",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          context_type: ChampionshipBracketTieBreakContextType.GROUP,
          group_id: "group-d",
          group_number: 4,
          qualification_rank: null,
          title: "Sorteio manual do Grupo D",
          description: "Empate total entre Eta e Theta.",
          teams: [
            { team_id: "team-eta", team_name: "ETA" },
            { team_id: "team-theta", team_name: "THETA" },
          ],
        },
        {
          context_key: "context-group-e",
          competition_id: "competition-1",
          sport_name: "Beach Soccer",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          context_type: ChampionshipBracketTieBreakContextType.GROUP,
          group_id: "group-e",
          group_number: 5,
          qualification_rank: null,
          title: "Sorteio manual do Grupo E",
          description: "Empate total entre Iota e Kappa.",
          teams: [
            { team_id: "team-iota", team_name: "IOTA" },
            { team_id: "team-kappa", team_name: "KAPPA" },
          ],
        },
      ],
      error: null,
    });
    saveTieBreakResolutionMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Falha ao salvar sorteio." },
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.TIE_BREAKS,
      matches: [
        buildMatch({
          id: "tie-break-match-error",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
    });

    const secondContextCardTitle = await screen.findByText("Sorteio manual do Grupo E");
    const secondContextCard = secondContextCardTitle.closest("div.glass-card");

    if (!secondContextCard) {
      throw new Error("Card do segundo contexto de sorteio não encontrado.");
    }

    fireEvent.click(within(secondContextCard).getByRole("button", { name: "Sortear ordem" }));
    expect(within(secondContextCard).getByRole("button", { name: "Refazer sorteio" })).toBeInTheDocument();

    const firstContextCardTitle = screen.getByText("Sorteio manual do Grupo D");
    const firstContextCard = firstContextCardTitle.closest("div.glass-card");

    if (!firstContextCard) {
      throw new Error("Card do primeiro contexto de sorteio não encontrado.");
    }

    fireEvent.click(within(firstContextCard).getByRole("button", { name: "Sortear ordem" }));
    fireEvent.click(within(firstContextCard).getByRole("button", { name: "Salvar sorteio" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    expect(screen.getByText("Sorteio manual do Grupo E")).toBeInTheDocument();
    expect(within(secondContextCard).getByRole("button", { name: "Refazer sorteio" })).toBeInTheDocument();
  });

  it("ao editar o campo jogo sincroniza queue_position e scheduled_slot", async () => {
    // Jogo na posição 5 — dropdown terá posições 1-5 disponíveis
    renderAdminMatches({
      matches: [
        buildMatch({
          id: "edit-game-slot-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          queue_position: 5,
          scheduled_slot: 5,
          home_team: buildTeam({ id: "edit-slot-home", name: "CASA SLOT" }),
          away_team: buildTeam({ id: "edit-slot-away", name: "VISITANTE SLOT" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo CASA SLOT x VISITANTE SLOT"));
    const matchCardContainer = getMatchCardContainerByTeamName("CASA SLOT");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    // Seleciona "Jogo 3" (disponível pois posição atual é 5 → dropdown mostra 1-5)
    fireEvent.click(screen.getByRole("combobox", { name: "Número do jogo" }));
    fireEvent.click(await screen.findByText("Jogo 3"));

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      queue_position: 3,
      scheduled_slot: 3,
    });
  });

  it("ao limpar o campo jogo salva queue_position e scheduled_slot como null", async () => {
    renderAdminMatches({
      matches: [
        buildMatch({
          id: "edit-game-slot-clear-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          queue_position: 9,
          scheduled_slot: 9,
          home_team: buildTeam({ id: "edit-slot-clear-home", name: "CASA SLOT CLEAR" }),
          away_team: buildTeam({ id: "edit-slot-clear-away", name: "VISITANTE SLOT CLEAR" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo CASA SLOT CLEAR x VISITANTE SLOT CLEAR"));
    const matchCardContainer = getMatchCardContainerByTeamName("CASA SLOT CLEAR");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.click(screen.getByRole("combobox", { name: "Número do jogo" }));
    fireEvent.click(await screen.findByText("Nenhum"));

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      queue_position: null,
      scheduled_slot: null,
    });
  });

  it("mostra labels de origem da vaga ao editar jogo de mata-mata", async () => {
    renderAdminMatches({
      matches: [
        buildMatch({
          id: "knockout-edit-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          home_team: buildTeam({ id: "knockout-home", name: "TIME CASA" }),
          away_team: buildTeam({ id: "knockout-away", name: "TIME VISITANTE" }),
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
        competitions: [
          {
            id: "competition-1",
            sport_id: "sport-1",
            sport_name: "Beach Soccer",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            groups_count: 4,
            qualifiers_per_group: 1,
            should_complete_knockout_with_best_second_placed_teams: true,
            third_place_mode: BracketThirdPlaceMode.MATCH,
            groups: [],
            knockout_matches: [
              {
                id: "knockout-binding-1",
                round_number: 1,
                slot_number: 1,
                match_id: "knockout-edit-match",
                status: MatchStatus.SCHEDULED,
                scheduled_date: "2026-04-11",
                queue_position: 1,
                start_time: null,
                end_time: null,
                location: "Praia de Piçarras",
                court_name: null,
                home_team_id: "knockout-home",
                away_team_id: "knockout-away",
                home_team_name: "TIME CASA",
                away_team_name: "TIME VISITANTE",
                winner_team_id: null,
                winner_team_name: null,
                is_bye: false,
                is_third_place: false,
              },
            ],
          },
        ],
      }),
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo TIME CASA x TIME VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("TIME CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(await screen.findByText(/Casa: Origem da vaga/)).toBeInTheDocument();
    expect(screen.getByText(/1º melhor 1º/)).toBeInTheDocument();
    expect(screen.getByText(/Visitante: Origem da vaga/)).toBeInTheDocument();
  });
});
