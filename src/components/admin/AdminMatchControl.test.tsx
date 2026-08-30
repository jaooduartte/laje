import { act } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMatchControl } from "@/components/admin/AdminMatchControl";
import {
  BracketEditionStatus,
  BracketPhase,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipIndividualSessionStatus,
  ChampionshipSchedulePeriod,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import type {
  ChampionshipBracketView,
  ChampionshipSport,
  ChampionshipIndividualSession,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import type { MatchBracketContext } from "@/lib/championship";

type SupabaseUpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  column: string;
  value: string;
};

type SupabaseUpdateResult = {
  error: { code?: string; message: string } | null;
};

const {
  supabaseUpdateCalls,
  supabaseUpdateResults,
  toastSuccessMock,
  toastErrorMock,
  saveMatchSetsMock,
  getBracketCourtSportsMock,
  individualEventsState,
  individualDisqualificationsState,
  individualSessionRepositoryMocks,
} = vi.hoisted(() => ({
  supabaseUpdateCalls: [] as SupabaseUpdateCall[],
  supabaseUpdateResults: [] as SupabaseUpdateResult[],
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  saveMatchSetsMock: vi.fn(),
  getBracketCourtSportsMock: vi.fn((..._args: unknown[]) =>
    new Promise<never>(() => {}),
  ),
  individualEventsState: {
    current: {
      events: [] as Array<Record<string, unknown>>,
      sessions: [] as ChampionshipIndividualSession[],
      entries: [] as Array<Record<string, unknown>>,
      refetch: vi.fn(),
    },
  },
  individualDisqualificationsState: {
    current: [],
  } as { current: Array<Record<string, unknown>> },
  individualSessionRepositoryMocks: {
    finish: vi.fn(),
    reopen: vi.fn(),
    returnToScheduled: vi.fn(),
    saveResults: vi.fn(),
    start: vi.fn(),
    participants: vi.fn(),
    walkover: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  getBracketCourtSports: (...args: unknown[]) => getBracketCourtSportsMock(...args),
  saveMatchSets: (...args: unknown[]) => saveMatchSetsMock(...args),
}));

vi.mock("@/hooks/useChampionshipIndividualEvents", () => ({
  useChampionshipIndividualEvents: () => individualEventsState.current,
}));

vi.mock("@/hooks/useCompetitionTeamDisqualifications", () => ({
  useCompetitionTeamDisqualifications: () => ({
    disqualifications: individualDisqualificationsState.current,
  }),
}));

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  finishChampionshipIndividualSession: (...args: unknown[]) =>
    individualSessionRepositoryMocks.finish(...args),
  fetchChampionshipIndividualSessionParticipants: (...args: unknown[]) =>
    individualSessionRepositoryMocks.participants(...args),
  markChampionshipIndividualEventTeamWalkover: (...args: unknown[]) =>
    individualSessionRepositoryMocks.walkover(...args),
  reopenChampionshipIndividualSession: (...args: unknown[]) =>
    individualSessionRepositoryMocks.reopen(...args),
  returnChampionshipIndividualSessionToScheduled: (...args: unknown[]) =>
    individualSessionRepositoryMocks.returnToScheduled(...args),
  saveChampionshipIndividualEventResults: (...args: unknown[]) =>
    individualSessionRepositoryMocks.saveResults(...args),
  startChampionshipIndividualSession: (...args: unknown[]) =>
    individualSessionRepositoryMocks.start(...args),
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: ({ sports, onSelect }: { sports: { id: string; name: string }[]; onSelect: (id: string | null) => void }) => (
    <button type="button" data-testid="sport-filter-mock" data-sports={sports.map((sport) => sport.name).join(",")} onClick={() => onSelect(sports[0]?.id ?? null)}>
      Filtro modalidade
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
    onItemsPerPageChange: (value: number) => void;
  }) => (
    <div>
      <button type="button" data-testid="pagination-controls-page-mock" onClick={() => onPageChange(2)}>
        Próxima página
      </button>
      <button type="button" data-testid="pagination-controls-size-mock" onClick={() => onItemsPerPageChange(25)}>
        Itens por página
      </button>
    </div>
  ),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (column: string, value: string) => {
          supabaseUpdateCalls.push({
            table,
            payload,
            column,
            value,
          });

          return supabaseUpdateResults.shift() ?? { error: null };
        },
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
    created_at: overrides.created_at ?? "2026-03-01T00:00:00.000Z",
  };
}

function buildSport(overrides: Partial<Sport> & Pick<Sport, "id" | "name">): Sport {
  return {
    id: overrides.id,
    name: overrides.name,
    created_at: overrides.created_at ?? "2026-03-01T00:00:00.000Z",
  };
}

function buildChampionshipSport(
  overrides: Partial<ChampionshipSport> & Pick<ChampionshipSport, "id" | "sport_id">,
): ChampionshipSport {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    sport_id: overrides.sport_id,
    naipe_mode: overrides.naipe_mode ?? ChampionshipSportNaipeMode.MASCULINO_FEMININO,
    result_rule: overrides.result_rule ?? ChampionshipSportResultRule.POINTS,
    supports_cards: overrides.supports_cards ?? false,
    tie_breaker_rule: overrides.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD,
    default_match_duration_minutes: overrides.default_match_duration_minutes ?? 30,
    show_estimated_start_time_on_cards: overrides.show_estimated_start_time_on_cards ?? false,
    points_win: overrides.points_win ?? 3,
    points_draw: overrides.points_draw ?? 1,
    points_loss: overrides.points_loss ?? 0,
    walkover_winner_points: overrides.walkover_winner_points ?? null,
    walkover_winner_set_count: overrides.walkover_winner_set_count ?? 1,
    awards_include_knockout_phase:
      overrides.awards_include_knockout_phase ?? false,
    supports_individual_awards: overrides.supports_individual_awards ?? false,
    created_at: overrides.created_at ?? "2026-03-01T00:00:00.000Z",
    championships: overrides.championships,
    sports: overrides.sports,
  };
}

function buildMatch(overrides: Partial<Match> & Pick<Match, "id" | "sport_id" | "status">): Match {
  const sportName = overrides.sports?.name ?? "Futevôlei";
  const homeTeam = overrides.home_team ?? buildTeam({ id: `${overrides.id}-home`, name: "Atlética Casa" });
  const awayTeam = overrides.away_team ?? buildTeam({ id: `${overrides.id}-away`, name: "Atlética Visitante" });

  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division === undefined ? TeamDivision.DIVISAO_PRINCIPAL : overrides.division,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    supports_cards: overrides.supports_cards ?? false,
    result_rule: overrides.result_rule ?? null,
    sport_id: overrides.sport_id,
    home_team_id: overrides.home_team_id ?? homeTeam.id,
    away_team_id: overrides.away_team_id ?? awayTeam.id,
    location: overrides.location ?? "Praia de Piçarras",
    court_name: overrides.court_name ?? null,
    scheduled_date: overrides.scheduled_date ?? "2026-04-11",
    queue_position: overrides.queue_position ?? 1,
    scheduled_slot: overrides.scheduled_slot ?? null,
    current_set_home_score: overrides.current_set_home_score ?? 0,
    current_set_away_score: overrides.current_set_away_score ?? 0,
    is_walkover: overrides.is_walkover ?? false,
    is_double_walkover: overrides.is_double_walkover ?? false,
    walkover_loser_team_id: overrides.walkover_loser_team_id ?? null,
    is_score_sheet_reviewed: overrides.is_score_sheet_reviewed ?? false,
    resolved_tie_breaker_rule: overrides.resolved_tie_breaker_rule ?? null,
    resolved_tie_break_winner_team_id: overrides.resolved_tie_break_winner_team_id ?? null,
    home_penalty_score: overrides.home_penalty_score ?? null,
    away_penalty_score: overrides.away_penalty_score ?? null,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    status: overrides.status,
    home_score: overrides.home_score ?? 0,
    home_yellow_cards: overrides.home_yellow_cards ?? 0,
    home_red_cards: overrides.home_red_cards ?? 0,
    away_score: overrides.away_score ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    created_at: overrides.created_at ?? "2026-03-20T08:00:00.000Z",
    group_number: overrides.group_number ?? null,
    championships: overrides.championships,
    sports: overrides.sports ?? buildSport({ id: overrides.sport_id, name: sportName }),
    home_team: homeTeam,
    away_team: awayTeam,
    match_sets: overrides.match_sets ?? [],
  };
}

function buildChampionshipBracketView(): ChampionshipBracketView {
  return {
    edition: {
      id: "edition-1",
      championship_id: "championship-1",
      season_year: 2026,
      status: BracketEditionStatus.GROUPS_GENERATED,
      payload_snapshot: {
        schedule_days: [],
      },
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
    competitions: [],
  };
}

function buildIndividualSession(
  overrides: Partial<ChampionshipIndividualSession> &
    Pick<ChampionshipIndividualSession, "id" | "sport_id">,
): ChampionshipIndividualSession {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    sport_id: overrides.sport_id,
    naipe: overrides.naipe ?? MatchNaipe.FEMININO,
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    scheduled_date: overrides.scheduled_date ?? "2026-04-11",
    period: overrides.period ?? ChampionshipSchedulePeriod.MATUTINO,
    start_time: overrides.start_time ?? null,
    end_time: overrides.end_time ?? null,
    location_key: overrides.location_key ?? "athletics-track",
    court_key: overrides.court_key ?? "lane-1",
    location_name: overrides.location_name ?? "Pista de Atletismo",
    court_name: overrides.court_name ?? "Raia 1",
    status: overrides.status ?? ChampionshipIndividualSessionStatus.DRAFT,
    exclusive_lock_enabled: overrides.exclusive_lock_enabled ?? true,
    created_at: overrides.created_at ?? "2026-03-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-01T00:00:00.000Z",
    sports: overrides.sports ?? buildSport({ id: overrides.sport_id, name: "Atletismo" }),
  };
}

function renderAdminMatchControl(params: {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  championshipStatus?: ChampionshipStatus;
  isInitialLoading?: boolean;
  isFetchingMatches?: boolean;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
  matchBracketContextByMatchId?: Record<string, MatchBracketContext>;
  isFullQueueVisible?: boolean;
  fullQueueItemsCount?: number | null;
  onFullQueueVisibleChange?: (isVisible: boolean) => void;
}) {
  const onRefetch = vi.fn();
  const onRefetchChampionshipBracket = vi.fn();
  const renderResult = render(
    <AdminMatchControl
      championshipId="championship-1"
      seasonYear={2026}
      matches={params.matches}
      championshipStatus={params.championshipStatus ?? ChampionshipStatus.IN_PROGRESS}
      championshipSports={params.championshipSports}
      isInitialLoading={params.isInitialLoading}
      isFetchingMatches={params.isFetchingMatches}
      championshipBracketView={buildChampionshipBracketView()}
      matchBracketContextByMatchId={params.matchBracketContextByMatchId ?? {}}
      visualQueuePositionByMatchId={params.visualQueuePositionByMatchId}
      estimatedStartTimeByMatchId={params.estimatedStartTimeByMatchId}
      isFullQueueVisible={params.isFullQueueVisible}
      fullQueueItemsCount={params.fullQueueItemsCount}
      onFullQueueVisibleChange={params.onFullQueueVisibleChange}
      onRefetch={onRefetch}
      onRefetchChampionshipBracket={onRefetchChampionshipBracket}
      canManageScoreboard
    />,
  );

  const rerenderAdminMatchControl = (nextParams: {
    matches: Match[];
    championshipSports: ChampionshipSport[];
    championshipStatus?: ChampionshipStatus;
    isInitialLoading?: boolean;
    isFetchingMatches?: boolean;
    visualQueuePositionByMatchId?: Record<string, number>;
    estimatedStartTimeByMatchId?: Record<string, string>;
    matchBracketContextByMatchId?: Record<string, MatchBracketContext>;
    isFullQueueVisible?: boolean;
    fullQueueItemsCount?: number | null;
    onFullQueueVisibleChange?: (isVisible: boolean) => void;
  }) => {
    renderResult.rerender(
      <AdminMatchControl
        championshipId="championship-1"
        seasonYear={2026}
        matches={nextParams.matches}
        championshipStatus={nextParams.championshipStatus ?? ChampionshipStatus.IN_PROGRESS}
        championshipSports={nextParams.championshipSports}
        isInitialLoading={nextParams.isInitialLoading}
        isFetchingMatches={nextParams.isFetchingMatches}
        championshipBracketView={buildChampionshipBracketView()}
        matchBracketContextByMatchId={nextParams.matchBracketContextByMatchId ?? {}}
        visualQueuePositionByMatchId={nextParams.visualQueuePositionByMatchId}
        estimatedStartTimeByMatchId={nextParams.estimatedStartTimeByMatchId}
        isFullQueueVisible={nextParams.isFullQueueVisible}
        fullQueueItemsCount={nextParams.fullQueueItemsCount}
        onFullQueueVisibleChange={nextParams.onFullQueueVisibleChange}
        onRefetch={onRefetch}
        onRefetchChampionshipBracket={onRefetchChampionshipBracket}
        canManageScoreboard
      />,
    );
  };

  return {
    onRefetch,
    onRefetchChampionshipBracket,
    rerenderAdminMatchControl,
    unmount: renderResult.unmount,
  };
}

function resolveMatchCardElement(teamName: string): HTMLElement {
  const teamLabel = screen.getAllByText(teamName)[0];
  const matchCardElement = teamLabel.closest(".admin-match-control-card");

  if (!matchCardElement) {
    throw new Error(`Card do jogo não encontrado para ${teamName}.`);
  }

  return matchCardElement as HTMLElement;
}

async function selectWalkoverOption(matchCardElement: HTMLElement, optionLabel: string): Promise<void> {
  const walkoverSelectTrigger = within(matchCardElement).getByRole("combobox", { name: "W.O.?" });

  await act(async () => {
    fireEvent.click(walkoverSelectTrigger);
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });

  const walkoverOption = screen.getByRole("option", { name: optionLabel });

  await act(async () => {
    fireEvent.click(walkoverOption);
    await Promise.resolve();
  });
}

async function completeInitialControlLoad(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function selectControlFilterOption(filterLabel: string, optionLabel: string): Promise<void> {
  const filterTrigger = screen.getByRole("combobox", { name: filterLabel });

  await act(async () => {
    fireEvent.click(filterTrigger);
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });

  const filterOption = screen.getByRole("option", { name: optionLabel });

  await act(async () => {
    fireEvent.click(filterOption);
    await Promise.resolve();
  });
}

async function confirmFinishDialog(): Promise<void> {
  const confirmDialogTitle = screen.getByText("Encerrar jogo");
  const confirmAction =
    screen
      .getAllByText(/^encerrar$/i)
      .map((element) => element.closest("button"))
      .find((element): element is HTMLButtonElement => element instanceof HTMLButtonElement) ?? null;

  if (!confirmDialogTitle || !confirmAction) {
    throw new Error("Dialog de confirmação para encerrar jogo não encontrado.");
  }

  await act(async () => {
    fireEvent.click(confirmAction);
    await Promise.resolve();
  });
}

async function confirmReturnToScheduledDialog(): Promise<void> {
  const confirmDialogTitle = screen.getByRole("heading", { name: "Voltar ao agendamento" });
  const confirmAction = screen.getByRole("button", { name: "Voltar ao agendamento" });

  if (!confirmDialogTitle || !confirmAction) {
    throw new Error("Dialog de confirmação para voltar ao agendamento não encontrado.");
  }

  await act(async () => {
    fireEvent.click(confirmAction);
    await Promise.resolve();
  });
}

describe("AdminMatchControl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    supabaseUpdateCalls.length = 0;
    supabaseUpdateResults.length = 0;
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    saveMatchSetsMock.mockReset();
    saveMatchSetsMock.mockResolvedValue({ error: null });
    individualEventsState.current = {
      events: [],
      sessions: [],
      entries: [],
      refetch: vi.fn(),
    };
    individualDisqualificationsState.current = [];
    individualSessionRepositoryMocks.finish.mockReset();
    individualSessionRepositoryMocks.reopen.mockReset();
    individualSessionRepositoryMocks.returnToScheduled.mockReset();
    individualSessionRepositoryMocks.saveResults.mockReset();
    individualSessionRepositoryMocks.walkover.mockReset();
    individualSessionRepositoryMocks.participants.mockReset();
    individualSessionRepositoryMocks.participants.mockResolvedValue({
      data: [],
      error: null,
    });
    individualSessionRepositoryMocks.start.mockReset();
    window.sessionStorage.clear();
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("mantém o skeleton ao recarregar a fila antes dos filtros de modalidade estarem disponíveis", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    const { rerenderAdminMatchControl } = renderAdminMatchControl({
      matches: [],
      championshipSports: [athleticsSport],
    });

    await completeInitialControlLoad();

    await act(async () => {
      rerenderAdminMatchControl({
        matches: [],
        championshipSports: [],
        isInitialLoading: true,
      });
      await Promise.resolve();
    });

    expect(screen.getByTestId("admin-match-control-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("sport-filter-mock")).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum jogo ao vivo ou agendado.")).not.toBeInTheDocument();

    await act(async () => {
      rerenderAdminMatchControl({
        matches: [],
        championshipSports: [athleticsSport],
        isInitialLoading: false,
      });
      await Promise.resolve();
    });

    expect(screen.queryByTestId("admin-match-control-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("sport-filter-mock")).toBeInTheDocument();
    expect(screen.getByText("Nenhum jogo ao vivo ou agendado.")).toBeInTheDocument();
  });

  it("exibe sessão individual configurada em revisão e inclui seus dados nos filtros", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "athletics-session",
          sport_id: athleticsSport.sport_id,
          naipe: MatchNaipe.FEMININO,
          location_name: "Pista de Atletismo",
          court_name: "Raia 1",
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };
    individualSessionRepositoryMocks.participants.mockResolvedValue({
      data: [
        buildTeam({
          id: "athletics-participant-zulu",
          name: "Zulu",
          division: TeamDivision.DIVISAO_ACESSO,
        }),
        buildTeam({
          id: "athletics-participant-alfa",
          name: "Alfa",
          division: TeamDivision.DIVISAO_PRINCIPAL,
        }),
        buildTeam({
          id: "athletics-participant-bravo",
          name: "Bravo",
          division: TeamDivision.DIVISAO_ACESSO,
        }),
      ],
      error: null,
    });

    renderAdminMatchControl({
      matches: [],
      championshipSports: [athleticsSport],
      championshipStatus: ChampionshipStatus.REVIEW,
    });

    await completeInitialControlLoad();

    expect(screen.getByText(/^Atletismo •/)).toBeInTheDocument();
    expect(screen.getByText("Feminino")).toBeInTheDocument();
    expect(screen.getByText(/^Atletismo •/).closest(".admin-match-control-card")).not.toBeNull();
    expect(screen.getByText(/11\/04\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Pendente de agendamento")).toBeInTheDocument();
    expect(screen.queryByText("Atléticas participantes (3)")).toBeNull();
    expect(screen.queryByText("Provas")).toBeNull();
    expect(screen.queryByText("Prévia parcial da sessão")).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar sessão" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Registrar resultados" }),
    ).toBeDisabled();

    await selectControlFilterOption(
      "Filtrar por local no controle ao vivo",
      "Pista de Atletismo",
    );
    await selectControlFilterOption(
      "Filtrar por quadra no controle ao vivo",
      "Raia 1",
    );

    expect(screen.getByText(/^Atletismo •/)).toBeInTheDocument();

    const naipeFilter = screen.getByRole("combobox", {
      name: "Filtrar por naipe no controle ao vivo",
    });
    await act(async () => {
      fireEvent.click(naipeFilter);
      await Promise.resolve();
    });

    expect(screen.getByRole("option", { name: "Feminino" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Masculino" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Misto" })).toBeNull();
  });

  it("desabilita o registro de resultados de Natação em revisão", async () => {
    const swimmingSport = buildChampionshipSport({
      id: "championship-sport-swimming",
      sport_id: "sport-swimming",
      sports: buildSport({ id: "sport-swimming", name: "Natação" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "swimming-session",
          sport_id: swimmingSport.sport_id,
          sports: swimmingSport.sports,
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };

    renderAdminMatchControl({
      matches: [],
      championshipSports: [swimmingSport],
      championshipStatus: ChampionshipStatus.REVIEW,
    });

    await completeInitialControlLoad();

    expect(screen.getByText(/^Natação •/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Registrar resultados" }),
    ).toBeDisabled();
  });

  it("inicia uma sessão individual agendada sem validar a data", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "scheduled-individual-session",
          sport_id: athleticsSport.sport_id,
          scheduled_date: "2027-12-31",
          status: ChampionshipIndividualSessionStatus.SCHEDULED,
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };
    individualSessionRepositoryMocks.start.mockResolvedValue({ error: null });

    renderAdminMatchControl({
      matches: [],
      championshipSports: [athleticsSport],
    });

    await completeInitialControlLoad();

    const sessionCard = screen.getByText(/^Atletismo •/).closest(".admin-match-control-card");
    expect(sessionCard).not.toBeNull();
    expect(
      within(sessionCard as HTMLElement).getByRole("button", {
        name: "Iniciar sessão",
      }).parentElement?.previousElementSibling,
    ).toHaveTextContent("Atletismo");
    expect(within(sessionCard as HTMLElement).queryByText("Agendada")).toBeNull();
    expect(within(sessionCard as HTMLElement).queryByText("Prévia parcial da sessão")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
      await Promise.resolve();
    });

    expect(individualSessionRepositoryMocks.start).toHaveBeenCalledWith("scheduled-individual-session");
  });

  it("permite retornar uma sessão individual ao agendamento preservando a ação no servidor", async () => {
    const swimmingSport = buildChampionshipSport({
      id: "championship-sport-swimming",
      sport_id: "sport-swimming",
      sports: buildSport({ id: "sport-swimming", name: "Natação" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "live-individual-session",
          sport_id: swimmingSport.sport_id,
          sports: swimmingSport.sports,
          status: ChampionshipIndividualSessionStatus.LIVE,
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };
    individualSessionRepositoryMocks.returnToScheduled.mockResolvedValue({ error: null });

    renderAdminMatchControl({
      matches: [],
      championshipSports: [swimmingSport],
    });

    await completeInitialControlLoad();

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Voltar para agendada" }).at(-1)!);
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Voltar sessão para agendada" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Voltar para agendada" }));
      await Promise.resolve();
    });

    expect(individualSessionRepositoryMocks.returnToScheduled).toHaveBeenCalledWith("live-individual-session");
  });

  it("abre a modal de resultados para a sessão individual ao vivo", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      events: [
        {
          id: "event-100m",
          session_id: "live-individual-session",
          name: "100 metros rasos",
          event_code: "ATHLETICS_100M",
        },
      ],
      sessions: [
        buildIndividualSession({
          id: "live-individual-session",
          sport_id: athleticsSport.sport_id,
          status: ChampionshipIndividualSessionStatus.LIVE,
        }),
      ],
      entries: [
        {
          id: "entry-team-1",
          event_id: "event-100m",
          team_id: "team-1",
          athlete_name: "Atleta 1",
          status: "PENDING",
          final_position: null,
          points_awarded: 0,
          result_time_milliseconds: null,
          result_mark_centimeters: null,
          teams: { name: "Atlética 1" },
        },
      ],
      refetch: vi.fn(),
    };
    renderAdminMatchControl({
      matches: [],
      championshipSports: [athleticsSport],
    });

    await completeInitialControlLoad();

    expect(individualSessionRepositoryMocks.participants).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar resultados" }));
      await Promise.resolve();
    });
    expect(individualSessionRepositoryMocks.participants).toHaveBeenCalledWith(
      "live-individual-session",
    );
    expect(
      screen.getByRole("heading", { name: "Registrar provas - Atletismo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("100 metros rasos")).toBeInTheDocument();
    expect(screen.getByText("Atleta")).toBeInTheDocument();
  });

  it("mantém as sessões individuais após os jogos coletivos no filtro Todas", async () => {
    const match = buildMatch({
      id: "collective-match",
      sport_id: "sport-futsal",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
      home_team: buildTeam({ id: "team-home", name: "Casa" }),
      away_team: buildTeam({ id: "team-away", name: "Visitante" }),
    });
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "athletics-session",
          sport_id: athleticsSport.sport_id,
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [athleticsSport],
    });

    await completeInitialControlLoad();

    const collectiveMatchCard = resolveMatchCardElement("Casa");
    const individualSessionCard = screen
      .getByText(/^Atletismo •/)
      .closest(".admin-match-control-card");

    expect(collectiveMatchCard).toHaveClass("order-2");
    expect(collectiveMatchCard).toHaveClass("list-item-card", "admin-match-control-scheduled-card");
    expect(collectiveMatchCard).not.toHaveClass("glass-card");
    expect(individualSessionCard).toHaveClass("order-3");
    expect(individualSessionCard).toHaveClass(
      "list-item-card",
      "admin-match-control-individual-session-card",
    );
    expect(individualSessionCard).not.toHaveClass("glass-card");
  });

  it("destaca jogo ao vivo sem aplicar glow ou blur na superfície operacional", async () => {
    const match = buildMatch({
      id: "live-match-surface",
      sport_id: "sport-futsal",
      status: MatchStatus.LIVE,
      sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
      home_team: buildTeam({ id: "live-home", name: "Atlética Ao Vivo" }),
      away_team: buildTeam({ id: "live-away", name: "Atlética Visitante Ao Vivo" }),
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [],
    });

    await completeInitialControlLoad();

    const liveMatchCard = resolveMatchCardElement("Atlética Ao Vivo");

    expect(liveMatchCard).toHaveClass(
      "list-item-card",
      "admin-match-control-card",
      "list-item-card-live",
      "admin-match-control-live-card",
    );
    expect(liveMatchCard).not.toHaveClass("glass-card", "live-glow");
  });

  it("exibe sessões individuais somente depois da última página de jogos coletivos", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      events: [],
      sessions: [
        buildIndividualSession({
          id: "athletics-session",
          sport_id: athleticsSport.sport_id,
        }),
      ],
      entries: [],
      refetch: vi.fn(),
    };

    const collectiveMatches = Array.from({ length: 15 }, (_, index) =>
      buildMatch({
        id: `collective-match-${index}`,
        sport_id: "sport-futsal",
        status: MatchStatus.SCHEDULED,
        sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
      }),
    );

    renderAdminMatchControl({
      matches: collectiveMatches,
      championshipSports: [athleticsSport],
    });

    await completeInitialControlLoad();

    fireEvent.click(
      screen.getByRole("button", { name: "Ver fila completa" }),
    );

    expect(screen.queryByText(/^Atletismo •/)).toBeNull();

    fireEvent.click(screen.getByTestId("pagination-controls-page-mock"));

    expect(screen.getByText(/^Atletismo •/)).toBeInTheDocument();
  });

  it("inicia um jogo agendado e envia status ao vivo para o backend", async () => {
    const match = buildMatch({
      id: "scheduled-match",
      sport_id: "sport-points",
      status: MatchStatus.SCHEDULED,
      start_time: "2026-04-11T10:00:00.000Z",
      end_time: "2026-04-11T09:40:00.000Z",
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-points",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
    });
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /iniciar/i }));
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.table).toBe("matches");
    expect(supabaseUpdateCalls[0]?.value).toBe("scheduled-match");
    expect(supabaseUpdateCalls[0]?.payload.status).toBe(MatchStatus.LIVE);
    expect(supabaseUpdateCalls[0]?.payload.start_time).toBe("2026-04-11T10:00:00.000Z");
    expect(supabaseUpdateCalls[0]?.payload.end_time).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo iniciado!");
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onRefetchChampionshipBracket).toHaveBeenCalledTimes(1);
  });

  it("bloqueia o início em uma quadra já ocupada por outra modalidade", () => {
    const liveBasketballMatch = buildMatch({
      id: "live-basketball-match",
      sport_id: "sport-basketball",
      status: MatchStatus.LIVE,
      location: "Campus Park",
      court_name: "Quadra",
      scheduled_date: "2026-04-11",
      home_team: buildTeam({
        id: "live-basketball-home",
        name: "Basquete ao vivo",
      }),
      away_team: buildTeam({
        id: "live-basketball-away",
        name: "Adversário ao vivo",
      }),
    });
    const blockedFutsalMatch = buildMatch({
      id: "blocked-futsal-match",
      sport_id: "sport-futsal",
      status: MatchStatus.SCHEDULED,
      location: "Campus Park",
      court_name: "Quadra",
      scheduled_date: "2026-04-11",
      home_team: buildTeam({
        id: "blocked-futsal-home",
        name: "Futsal bloqueado",
      }),
      away_team: buildTeam({
        id: "blocked-futsal-away",
        name: "Adversário bloqueado",
      }),
    });
    const availableFutsalMatch = buildMatch({
      id: "available-futsal-match",
      sport_id: "sport-futsal",
      status: MatchStatus.SCHEDULED,
      location: "Campus Park",
      court_name: "Ginásio",
      scheduled_date: "2026-04-11",
      home_team: buildTeam({
        id: "available-futsal-home",
        name: "Futsal disponível",
      }),
      away_team: buildTeam({
        id: "available-futsal-away",
        name: "Adversário disponível",
      }),
    });

    renderAdminMatchControl({
      matches: [liveBasketballMatch, blockedFutsalMatch, availableFutsalMatch],
      championshipSports: [
        buildChampionshipSport({
          id: "championship-sport-basketball",
          sport_id: "sport-basketball",
        }),
        buildChampionshipSport({
          id: "championship-sport-futsal",
          sport_id: "sport-futsal",
        }),
      ],
    });

    const blockedMatchCard = resolveMatchCardElement("Futsal bloqueado");
    const availableMatchCard = resolveMatchCardElement("Futsal disponível");

    expect(
      within(blockedMatchCard).getByRole("button", { name: "Iniciar" }),
    ).toBeDisabled();
    expect(
      within(blockedMatchCard).getByText(
        "Quadra ocupada: 1 jogo(s) ao vivo.",
      ),
    ).toBeInTheDocument();
    expect(
      within(availableMatchCard).getByRole("button", { name: "Iniciar" }),
    ).toBeEnabled();
  });

  it("volta jogo ao agendamento limpando apenas dados operacionais", async () => {
    const match = buildMatch({
      id: "return-to-scheduled-match",
      sport_id: "sport-return-scheduled",
      status: MatchStatus.LIVE,
      start_time: "2026-04-11T10:40:00.000Z",
      end_time: "2026-04-11T11:05:00.000Z",
      home_score: 2,
      away_score: 1,
      home_yellow_cards: 1,
      away_red_cards: 1,
      queue_position: 6,
      scheduled_slot: 6,
      home_team: buildTeam({ id: "return-home-team", name: "Atlética Retorno Casa" }),
      away_team: buildTeam({ id: "return-away-team", name: "Atlética Retorno Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-return-scheduled",
      sport_id: "sport-return-scheduled",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: true,
    });

    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /voltar ao agendamento/i }));
    });
    await confirmReturnToScheduledDialog();

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      status: MatchStatus.SCHEDULED,
      start_time: "2026-04-11T10:40:00.000Z",
      end_time: null,
      home_score: 0,
      away_score: 0,
      home_yellow_cards: 0,
      home_red_cards: 0,
      away_yellow_cards: 0,
      away_red_cards: 0,
      is_walkover: false,
      is_double_walkover: false,
      walkover_loser_team_id: null,
    });
    expect(supabaseUpdateCalls[0]?.payload).not.toHaveProperty("scheduled_slot");
    expect(supabaseUpdateCalls[0]?.payload).not.toHaveProperty("queue_position");
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo voltou ao agendamento.");
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onRefetchChampionshipBracket).toHaveBeenCalledTimes(1);
  });

  it("encerra jogo agendado por W.O. no beach soccer com placar máximo para a atlética presente", async () => {
    const homeTeam = buildTeam({ id: "wo-home-team", name: "Atlética WO Casa" });
    const awayTeam = buildTeam({ id: "wo-away-team", name: "Atlética WO Visitante" });
    const match = buildMatch({
      id: "scheduled-walkover-points-match",
      sport_id: "sport-beach-soccer-wo",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "sport-beach-soccer-wo", name: "Beach Soccer" }),
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-beach-soccer-wo",
      sport_id: "sport-beach-soccer-wo",
      result_rule: ChampionshipSportResultRule.POINTS,
      walkover_winner_points: 3,
    });
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Casa");
    await selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(saveMatchSetsMock).not.toHaveBeenCalled();
    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.value).toBe("scheduled-walkover-points-match");
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      home_score: 0,
      away_score: 3,
      status: MatchStatus.FINISHED,
      is_walkover: true,
      is_double_walkover: false,
      walkover_loser_team_id: homeTeam.id,
    });
    expect(typeof supabaseUpdateCalls[0]?.payload.start_time).toBe("string");
    expect(supabaseUpdateCalls[0]?.payload.end_time).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo encerrado por W.O.! Classificação atualizada.");
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onRefetchChampionshipBracket).toHaveBeenCalledTimes(1);
  });

  it("encerra jogo agendado por W.O. em modalidade por sets gravando set com pontuação máxima", async () => {
    const homeTeam = buildTeam({ id: "wo-sets-home-team", name: "Atlética Sets WO Casa" });
    const awayTeam = buildTeam({ id: "wo-sets-away-team", name: "Atlética Sets WO Visitante" });
    const match = buildMatch({
      id: "scheduled-walkover-sets-match",
      sport_id: "sport-beach-volley-wo",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "sport-beach-volley-wo", name: "Vôlei de Praia" }),
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-beach-volley-wo",
      sport_id: "sport-beach-volley-wo",
      result_rule: ChampionshipSportResultRule.SETS,
      walkover_winner_points: 21,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Sets WO Casa");
    await selectWalkoverOption(matchCardElement, awayTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(saveMatchSetsMock).toHaveBeenCalledWith("scheduled-walkover-sets-match", [
      {
        set_number: 1,
        home_points: 21,
        away_points: 0,
      },
    ]);
    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      home_score: 1,
      away_score: 0,
      status: MatchStatus.FINISHED,
      is_walkover: true,
      is_double_walkover: false,
      walkover_loser_team_id: awayTeam.id,
    });
  });

  it("encerra jogo agendado por W.O. em modalidade por sets com a quantidade configurada", async () => {
    const homeTeam = buildTeam({ id: "wo-best-of-three-home-team", name: "Atlética Melhor de Três Casa" });
    const awayTeam = buildTeam({ id: "wo-best-of-three-away-team", name: "Atlética Melhor de Três Visitante" });
    const match = buildMatch({
      id: "scheduled-walkover-best-of-three-match",
      sport_id: "sport-volleyball-best-of-three-wo",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "sport-volleyball-best-of-three-wo", name: "Voleibol" }),
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      home_team: homeTeam,
      away_team: awayTeam,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-volleyball-best-of-three-wo",
      sport_id: "sport-volleyball-best-of-three-wo",
      result_rule: ChampionshipSportResultRule.SETS,
      walkover_winner_points: 21,
      walkover_winner_set_count: 2,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Melhor de Três Casa");
    await selectWalkoverOption(matchCardElement, awayTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(saveMatchSetsMock).toHaveBeenCalledWith(
      "scheduled-walkover-best-of-three-match",
      [
        { set_number: 1, home_points: 21, away_points: 0 },
        { set_number: 2, home_points: 21, away_points: 0 },
      ],
    );
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      home_score: 2,
      away_score: 0,
    });
  });

  it("encerra jogo agendado por W.O. duplo com placar zerado e sem perdedor definido", async () => {
    const homeTeam = buildTeam({ id: "double-wo-home-team", name: "Atlética WO Duplo Casa" });
    const awayTeam = buildTeam({ id: "double-wo-away-team", name: "Atlética WO Duplo Visitante" });
    const match = buildMatch({
      id: "scheduled-double-walkover-match",
      sport_id: "sport-double-wo",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "sport-double-wo", name: "Futebol Society" }),
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      home_score: 2,
      away_score: 1,
      home_yellow_cards: 1,
      away_red_cards: 1,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-double-wo",
      sport_id: "sport-double-wo",
      result_rule: ChampionshipSportResultRule.POINTS,
      walkover_winner_points: 3,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Duplo Casa");
    await selectWalkoverOption(matchCardElement, "Ambas as atléticas tomaram W.O.");

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(saveMatchSetsMock).not.toHaveBeenCalled();
    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      home_score: 0,
      away_score: 0,
      home_yellow_cards: 0,
      home_red_cards: 0,
      away_yellow_cards: 0,
      away_red_cards: 0,
      status: MatchStatus.FINISHED,
      is_walkover: true,
      is_double_walkover: true,
      walkover_loser_team_id: null,
    });
  });

  it("bloqueia W.O. no ao vivo quando já existe placar lançado", async () => {
    const homeTeam = buildTeam({ id: "wo-live-home-team", name: "Atlética WO Ao Vivo Casa" });
    const awayTeam = buildTeam({ id: "wo-live-away-team", name: "Atlética WO Ao Vivo Visitante" });
    const match = buildMatch({
      id: "live-walkover-blocked-match",
      sport_id: "sport-live-wo",
      status: MatchStatus.LIVE,
      home_score: 1,
      away_score: 0,
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-live-wo",
      sport_id: "sport-live-wo",
      result_rule: ChampionshipSportResultRule.POINTS,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Ao Vivo Casa");
    await selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(toastErrorMock).toHaveBeenCalledWith("Não é possível aplicar W.O. em jogo ao vivo com placar ou sets já lançados.");
  });

  it("exibe seletor de W.O. apenas em cards agendados e ao vivo", () => {
    const scheduledMatch = buildMatch({
      id: "wo-scheduled-visibility-match",
      sport_id: "sport-wo-visibility",
      status: MatchStatus.SCHEDULED,
      home_team: buildTeam({ id: "wo-scheduled-home", name: "Atlética WO Visibilidade Agendado" }),
      away_team: buildTeam({ id: "wo-scheduled-away", name: "Atlética WO Visibilidade Agendado 2" }),
    });
    const liveMatch = buildMatch({
      id: "wo-live-visibility-match",
      sport_id: "sport-wo-visibility",
      status: MatchStatus.LIVE,
      home_team: buildTeam({ id: "wo-live-home", name: "Atlética WO Visibilidade Ao Vivo" }),
      away_team: buildTeam({ id: "wo-live-away", name: "Atlética WO Visibilidade Ao Vivo 2" }),
    });
    const finishedMatch = buildMatch({
      id: "wo-finished-visibility-match",
      sport_id: "sport-wo-visibility",
      status: MatchStatus.FINISHED,
      home_team: buildTeam({ id: "wo-finished-home", name: "Atlética WO Visibilidade Encerrado" }),
      away_team: buildTeam({ id: "wo-finished-away", name: "Atlética WO Visibilidade Encerrado 2" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-wo-visibility",
      sport_id: "sport-wo-visibility",
      result_rule: ChampionshipSportResultRule.POINTS,
    });

    renderAdminMatchControl({
      matches: [scheduledMatch, liveMatch, finishedMatch],
      championshipSports: [championshipSport],
    });

    expect(within(resolveMatchCardElement("Atlética WO Visibilidade Agendado")).getByRole("combobox", { name: "W.O.?" })).toBeInTheDocument();
    expect(within(resolveMatchCardElement("Atlética WO Visibilidade Ao Vivo")).getByRole("combobox", { name: "W.O.?" })).toBeInTheDocument();
    expect(
      screen.queryByText("Atlética WO Visibilidade Encerrado"),
    ).toBeNull();
  });

  it("bloqueia aplicação de W.O. quando campeonato não está em andamento", async () => {
    const homeTeam = buildTeam({ id: "wo-blocked-home-team", name: "Atlética WO Bloqueio Casa" });
    const awayTeam = buildTeam({ id: "wo-blocked-away-team", name: "Atlética WO Bloqueio Visitante" });
    const match = buildMatch({
      id: "live-walkover-status-blocked-match",
      sport_id: "sport-live-wo-status",
      status: MatchStatus.LIVE,
      home_score: 0,
      away_score: 0,
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-live-wo-status",
      sport_id: "sport-live-wo-status",
      result_rule: ChampionshipSportResultRule.POINTS,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      championshipStatus: ChampionshipStatus.PLANNING,
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Bloqueio Casa");
    await selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });
    await confirmFinishDialog();

    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(toastErrorMock).toHaveBeenCalledWith("Só é possível aplicar W.O. quando o campeonato estiver Em andamento.");
  });

  it("bloqueia W.O. duplo em jogo de mata-mata", async () => {
    const homeTeam = buildTeam({ id: "double-wo-knockout-home", name: "Atlética WO Duplo Mata-mata Casa" });
    const awayTeam = buildTeam({ id: "double-wo-knockout-away", name: "Atlética WO Duplo Mata-mata Visitante" });
    const match = buildMatch({
      id: "knockout-double-walkover-match",
      sport_id: "sport-knockout-double-wo",
      status: MatchStatus.SCHEDULED,
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-knockout-double-wo",
      sport_id: "sport-knockout-double-wo",
      result_rule: ChampionshipSportResultRule.POINTS,
      walkover_winner_points: 3,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      matchBracketContextByMatchId: {
        [match.id]: {
          badgeLabel: "Semifinal",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Semifinal",
        },
      },
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Duplo Mata-mata Casa");
    const walkoverSelectTrigger = within(matchCardElement).getByRole("combobox", { name: "W.O.?" });

    await act(async () => {
      fireEvent.click(walkoverSelectTrigger);
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(screen.getByRole("option", { name: "Ambas as atléticas tomaram W.O." })).toHaveAttribute("aria-disabled", "true");
  });

  it("abre modal de pênaltis ao encerrar empate no mata-mata da Society", async () => {
    const match = buildMatch({
      id: "society-knockout-tie-open-penalties",
      sport_id: "sport-society-knockout",
      status: MatchStatus.LIVE,
      home_score: 2,
      away_score: 2,
      championships: {
        id: "championship-society",
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
        status: ChampionshipStatus.IN_PROGRESS,
        current_season_year: 2026,
        uses_divisions: false,
        default_location: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
      home_team: buildTeam({ id: "society-open-home", name: "Society Casa" }),
      away_team: buildTeam({ id: "society-open-away", name: "Society Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-society-knockout",
      sport_id: "sport-society-knockout",
      result_rule: ChampionshipSportResultRule.POINTS,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      matchBracketContextByMatchId: {
        [match.id]: {
          badgeLabel: "Semifinal",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Semifinal",
        },
      },
    });

    const matchCardElement = resolveMatchCardElement("Society Casa");

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /finalizar/i }));
    });
    await confirmFinishDialog();

    expect(screen.getByRole("heading", { name: "Registrar pênaltis" })).toBeInTheDocument();
    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("bloqueia confirmação de pênaltis vazios ou empatados no mata-mata da Society", async () => {
    const match = buildMatch({
      id: "society-knockout-tie-invalid-penalties",
      sport_id: "sport-society-invalid",
      status: MatchStatus.LIVE,
      home_score: 1,
      away_score: 1,
      championships: {
        id: "championship-society-invalid",
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
        status: ChampionshipStatus.IN_PROGRESS,
        current_season_year: 2026,
        uses_divisions: false,
        default_location: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
      home_team: buildTeam({ id: "society-invalid-home", name: "Society Empate Casa" }),
      away_team: buildTeam({ id: "society-invalid-away", name: "Society Empate Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-society-invalid",
      sport_id: "sport-society-invalid",
      result_rule: ChampionshipSportResultRule.POINTS,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      matchBracketContextByMatchId: {
        [match.id]: {
          badgeLabel: "Quartas",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Quartas",
        },
      },
    });

    const matchCardElement = resolveMatchCardElement("Society Empate Casa");

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /finalizar/i }));
    });
    await confirmFinishDialog();

    fireEvent.click(screen.getByRole("button", { name: "Salvar pênaltis e encerrar" }));
    expect(toastErrorMock).toHaveBeenCalledWith("Informe o placar dos pênaltis para as duas atléticas.");
    expect(supabaseUpdateCalls).toHaveLength(0);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Gols nos pênaltis da casa" }), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Gols nos pênaltis do visitante" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar pênaltis e encerrar" }));

    expect(toastErrorMock).toHaveBeenCalledWith("O placar dos pênaltis precisa definir um vencedor.");
    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("encerra empate no mata-mata da Society salvando pênaltis e vencedor oficial", async () => {
    const homeTeam = buildTeam({ id: "society-finish-home", name: "Society Finalista Casa" });
    const awayTeam = buildTeam({ id: "society-finish-away", name: "Society Finalista Visitante" });
    const match = buildMatch({
      id: "society-knockout-finish-with-penalties",
      sport_id: "sport-society-finish",
      status: MatchStatus.LIVE,
      home_score: 2,
      away_score: 2,
      championships: {
        id: "championship-society-finish",
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
        status: ChampionshipStatus.IN_PROGRESS,
        current_season_year: 2026,
        uses_divisions: false,
        default_location: null,
        created_at: "2026-03-01T00:00:00.000Z",
      },
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-society-finish",
      sport_id: "sport-society-finish",
      result_rule: ChampionshipSportResultRule.POINTS,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
    });
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      matchBracketContextByMatchId: {
        [match.id]: {
          badgeLabel: "Final",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Final",
        },
      },
    });

    const matchCardElement = resolveMatchCardElement("Society Finalista Casa");

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /finalizar/i }));
    });
    await confirmFinishDialog();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Gols nos pênaltis da casa" }), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Gols nos pênaltis do visitante" }), {
      target: { value: "3" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar pênaltis e encerrar" }));
      await Promise.resolve();
    });

    const finishUpdateCall = [...supabaseUpdateCalls]
      .reverse()
      .find((updateCall) => updateCall.payload.status == MatchStatus.FINISHED);

    expect(finishUpdateCall).toBeDefined();
    expect(finishUpdateCall?.payload).toMatchObject({
      status: MatchStatus.FINISHED,
      home_score: 2,
      away_score: 2,
      home_penalty_score: 4,
      away_penalty_score: 3,
      resolved_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
      resolved_tie_break_winner_team_id: homeTeam.id,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo finalizado! Classificação atualizada.");
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onRefetchChampionshipBracket).toHaveBeenCalledTimes(1);
  });

  it("filtra a modalidade no controle ao vivo sem recarregar as abas administrativas", async () => {
    const match = buildMatch({
      id: "filter-match",
      sport_id: "sport-filter",
      status: MatchStatus.SCHEDULED,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-filter",
      sport_id: "sport-filter",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });
    const { onRefetch } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    fireEvent.click(screen.getByTestId("sport-filter-mock"));

    expect(onRefetch).not.toHaveBeenCalled();
  });

  it("inclui modalidades individuais no filtro de modalidades", () => {
    const match = buildMatch({
      id: "collective-sport-match",
      sport_id: "collective-sport",
      status: MatchStatus.SCHEDULED,
      sports: buildSport({ id: "collective-sport", name: "Futsal" }),
    });
    const collectiveSport = buildChampionshipSport({
      id: "championship-collective-sport",
      sport_id: "collective-sport",
      sports: buildSport({ id: "collective-sport", name: "Futsal" }),
    });
    const individualSport = buildChampionshipSport({
      id: "championship-athletics-sport",
      sport_id: "athletics-sport",
      sports: buildSport({ id: "athletics-sport", name: "Atletismo" }),
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [collectiveSport, individualSport],
    });

    expect(screen.getByTestId("sport-filter-mock")).toHaveAttribute(
      "data-sports",
      expect.stringContaining("Atletismo"),
    );
  });

  it("volta o filtro de modalidade para Todas quando a modalidade filtrada deixa de ter jogos no controle", async () => {
    const selectedSportMatch = buildMatch({
      id: "selected-sport-match",
      sport_id: "sport-filter-mock-id",
      status: MatchStatus.SCHEDULED,
      home_team: buildTeam({ id: "selected-sport-home", name: "Atlética Modalidade Atual" }),
      away_team: buildTeam({ id: "selected-sport-away", name: "Atlética Modalidade Atual Visitante" }),
      sports: buildSport({ id: "sport-filter-mock-id", name: "Beach Tennis" }),
    });
    const otherSportMatch = buildMatch({
      id: "other-sport-match",
      sport_id: "sport-other",
      status: MatchStatus.SCHEDULED,
      home_team: buildTeam({ id: "other-sport-home", name: "Atlética Modalidade Restante" }),
      away_team: buildTeam({ id: "other-sport-away", name: "Atlética Modalidade Restante Visitante" }),
      sports: buildSport({ id: "sport-other", name: "Vôlei de Praia" }),
    });
    const selectedChampionshipSport = buildChampionshipSport({
      id: "championship-sport-selected",
      sport_id: "sport-filter-mock-id",
      result_rule: ChampionshipSportResultRule.POINTS,
    });
    const otherChampionshipSport = buildChampionshipSport({
      id: "championship-sport-other",
      sport_id: "sport-other",
      result_rule: ChampionshipSportResultRule.POINTS,
    });
    const { rerenderAdminMatchControl } = renderAdminMatchControl({
      matches: [selectedSportMatch, otherSportMatch],
      championshipSports: [selectedChampionshipSport, otherChampionshipSport],
    });

    fireEvent.click(screen.getByTestId("sport-filter-mock"));

    expect(screen.getAllByText("Atlética Modalidade Atual").length).toBeGreaterThan(0);
    expect(screen.queryByText("Atlética Modalidade Restante")).toBeNull();

    await act(async () => {
      rerenderAdminMatchControl({
        matches: [otherSportMatch],
        championshipSports: [selectedChampionshipSport, otherChampionshipSport],
      });
      await Promise.resolve();
    });

    expect(screen.getAllByText("Atlética Modalidade Restante").length).toBeGreaterThan(0);
  });

  it("permite filtrar o controle ao vivo por divisão, grupo, local e quadra", async () => {
    const principalGroupBMatch = buildMatch({
      id: "principal-group-b",
      sport_id: "sport-filter",
      status: MatchStatus.SCHEDULED,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      location: "Arena Seven",
      court_name: "Quadra A",
      home_team: buildTeam({ id: "principal-group-b-home", name: "Principal Grupo B" }),
      away_team: buildTeam({ id: "principal-group-b-away", name: "Visitante Grupo B" }),
    });
    const principalGroupCMatch = buildMatch({
      id: "principal-group-c",
      sport_id: "sport-filter",
      status: MatchStatus.SCHEDULED,
      division: TeamDivision.DIVISAO_PRINCIPAL,
      location: "Arena Seven",
      court_name: "Quadra B",
      home_team: buildTeam({ id: "principal-group-c-home", name: "Principal Grupo C" }),
      away_team: buildTeam({ id: "principal-group-c-away", name: "Visitante Grupo C" }),
    });
    const accessGroupAMatch = buildMatch({
      id: "access-group-a",
      sport_id: "sport-filter",
      status: MatchStatus.SCHEDULED,
      division: TeamDivision.DIVISAO_ACESSO,
      location: "Arena Central",
      court_name: "Quadra 1",
      home_team: buildTeam({ id: "access-group-a-home", name: "Acesso Grupo A" }),
      away_team: buildTeam({ id: "access-group-a-away", name: "Visitante Grupo A" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-filter",
      sport_id: "sport-filter",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });

    renderAdminMatchControl({
      matches: [principalGroupBMatch, principalGroupCMatch, accessGroupAMatch],
      championshipSports: [championshipSport],
      matchBracketContextByMatchId: {
        [principalGroupBMatch.id]: {
          badgeLabel: "Grupo B",
          phase: BracketPhase.GROUP_STAGE,
          stageLabel: "Fase de grupos",
          groupFilterValue: "GROUP_B",
          groupLabel: "Grupo B",
        },
        [principalGroupCMatch.id]: {
          badgeLabel: "Grupo C",
          phase: BracketPhase.GROUP_STAGE,
          stageLabel: "Fase de grupos",
          groupFilterValue: "GROUP_C",
          groupLabel: "Grupo C",
        },
        [accessGroupAMatch.id]: {
          badgeLabel: "Grupo A",
          phase: BracketPhase.GROUP_STAGE,
          stageLabel: "Fase de grupos",
          groupFilterValue: "GROUP_A",
          groupLabel: "Grupo A",
        },
      },
    });

    expect(screen.getAllByText("Principal Grupo B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Principal Grupo C").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acesso Grupo A").length).toBeGreaterThan(0);

    expect(screen.getByRole("combobox", { name: "Filtrar por divisão no controle ao vivo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por grupo no controle ao vivo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por local no controle ao vivo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por quadra no controle ao vivo" })).toBeInTheDocument();

    await selectControlFilterOption("Filtrar por divisão no controle ao vivo", "Divisão Principal");

    expect(screen.getAllByText("Principal Grupo B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Principal Grupo C").length).toBeGreaterThan(0);
    expect(screen.queryByText("Acesso Grupo A")).toBeNull();

    await selectControlFilterOption("Filtrar por grupo no controle ao vivo", "Grupo C");

    expect(screen.queryByText("Principal Grupo B")).toBeNull();
    expect(screen.getAllByText("Principal Grupo C").length).toBeGreaterThan(0);

    await selectControlFilterOption("Filtrar por quadra no controle ao vivo", "Quadra B");

    expect(screen.queryByText("Principal Grupo B")).toBeNull();
    expect(screen.getAllByText("Principal Grupo C").length).toBeGreaterThan(0);
  });

  it("atualiza os dados ao trocar de página no controle ao vivo", async () => {
    const matches = Array.from({ length: 20 }).map((_, index) =>
      buildMatch({
        id: `page-match-${index + 1}`,
        sport_id: "sport-filter",
        status: MatchStatus.SCHEDULED,
        home_team: buildTeam({ id: `home-${index + 1}`, name: `Casa ${index + 1}` }),
        away_team: buildTeam({ id: `away-${index + 1}`, name: `Visitante ${index + 1}` }),
      }),
    );
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-filter",
      sport_id: "sport-filter",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });
    const { onRefetch } = renderAdminMatchControl({
      matches,
      championshipSports: [championshipSport],
    });

    expect(onRefetch).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Ver fila completa" }),
    );
    fireEvent.click(screen.getByTestId("pagination-controls-page-mock"));

    expect(onRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(onRefetch).toHaveBeenCalledTimes(2);
  });

  it("mantém na visão operacional somente o próximo jogo por quadra", async () => {
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-filter",
      sport_id: "sport-filter",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });
    const matches = [
      buildMatch({
        id: "court-a-live",
        sport_id: "sport-filter",
        status: MatchStatus.LIVE,
        court_name: "Quadra A",
        home_team: buildTeam({
          id: "court-a-live-home",
          name: "Casa A ao vivo",
        }),
        away_team: buildTeam({
          id: "court-a-live-away",
          name: "Visitante A ao vivo",
        }),
      }),
      ...Array.from({ length: 3 }, (_, index) =>
        buildMatch({
          id: `court-a-${index + 1}`,
          sport_id: "sport-filter",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra A",
          queue_position: index + 1,
          home_team: buildTeam({
            id: `court-a-home-${index + 1}`,
            name: `Casa A ${index + 1}`,
          }),
          away_team: buildTeam({
            id: `court-a-away-${index + 1}`,
            name: `Visitante A ${index + 1}`,
          }),
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        buildMatch({
          id: `court-b-${index + 1}`,
          sport_id: "sport-filter",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra B",
          queue_position: index + 1,
          home_team: buildTeam({
            id: `court-b-home-${index + 1}`,
            name: `Casa B ${index + 1}`,
          }),
          away_team: buildTeam({
            id: `court-b-away-${index + 1}`,
            name: `Visitante B ${index + 1}`,
          }),
        }),
      ),
    ];

    renderAdminMatchControl({
      matches,
      championshipSports: [championshipSport],
    });

    await completeInitialControlLoad();

    expect(screen.getAllByText("Casa A ao vivo")).not.toHaveLength(0);
    expect(screen.getByText("Casa A 1")).toBeInTheDocument();
    expect(screen.queryByText("Casa A 2")).toBeNull();
    expect(screen.queryByText("Casa A 3")).toBeNull();
    expect(screen.getByText("Casa B 1")).toBeInTheDocument();
    expect(screen.queryByText("Casa B 2")).toBeNull();
    expect(screen.queryByText("Casa B 3")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Ver fila completa" }),
    );

    expect(screen.getByText("Casa A 2")).toBeInTheDocument();
    expect(screen.getByText("Casa A 3")).toBeInTheDocument();
    expect(screen.getByText("Casa B 2")).toBeInTheDocument();
    expect(screen.getByText("Casa B 3")).toBeInTheDocument();
  });

  it("informa o total da fila completa sem confundi-lo com o recorte operacional", async () => {
    const matches = Array.from({ length: 2 }, (_, index) =>
      buildMatch({
        id: `operational-match-${index + 1}`,
        sport_id: "sport-points",
        status: MatchStatus.SCHEDULED,
      }),
    );

    renderAdminMatchControl({
      matches,
      championshipSports: [
        buildChampionshipSport({
          id: "championship-sport-points",
          sport_id: "sport-points",
        }),
      ],
      isFullQueueVisible: false,
      fullQueueItemsCount: 17,
      onFullQueueVisibleChange: vi.fn(),
    });

    await completeInitialControlLoad();

    expect(
      screen.getByText("2 itens de controle encontrados de 17 na fila completa"),
    ).toBeInTheDocument();
  });

  it("bloqueia o início do jogo quando o campeonato não está em andamento", async () => {
    const match = buildMatch({
      id: "blocked-scheduled-match",
      sport_id: "sport-points",
      status: MatchStatus.SCHEDULED,
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-points",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      championshipStatus: ChampionshipStatus.PLANNING,
    });

    const startButton = screen.getByRole("button", { name: /iniciar/i });

    expect(startButton).toBeDisabled();
    expect(screen.getByText("W.O.?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "O campeonato precisa estar Em andamento para iniciar jogos ao vivo.",
      ),
    ).toBeInTheDocument();
    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("usa a mesma ordenação da aba jogos para cards agendados no controle ao vivo", () => {
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-visual-order",
      sport_id: "sport-visual-order",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });

    renderAdminMatchControl({
      matches: [
        buildMatch({
          id: "court-a-game-3",
          sport_id: "sport-visual-order",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 4,
          scheduled_slot: 4,
          home_team: buildTeam({ id: "court-a-game-3-home", name: "CAMALEÃO B" }),
          away_team: buildTeam({ id: "court-a-game-3-away", name: "RAPOSAS" }),
        }),
        buildMatch({
          id: "court-a-game-4",
          sport_id: "sport-visual-order",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 3,
          scheduled_slot: 3,
          home_team: buildTeam({ id: "court-a-game-4-home", name: "GARRUDOS" }),
          away_team: buildTeam({ id: "court-a-game-4-away", name: "RASANTE B" }),
        }),
      ],
      championshipSports: [championshipSport],
      visualQueuePositionByMatchId: {
        "court-a-game-4": 3,
        "court-a-game-3": 4,
      },
      estimatedStartTimeByMatchId: {
        "court-a-game-4": "09:20",
        "court-a-game-3": "10:00",
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Ver fila completa" }),
    );

    const gameThreeCard = resolveMatchCardElement("CAMALEÃO B");
    const gameFourCard = resolveMatchCardElement("GARRUDOS");

    expect(gameFourCard.compareDocumentPosition(gameThreeCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gameFourCard).toHaveTextContent("Jogo 3");
    expect(gameThreeCard).toHaveTextContent("Jogo 4");
  });

  it("mostra a quadra no cabeçalho do card do controle ao vivo", () => {
    const match = buildMatch({
      id: "live-match-location-and-court",
      sport_id: "sport-location-and-court",
      status: MatchStatus.LIVE,
      location: "Arena Seven",
      court_name: "Quadra Central",
      home_team: buildTeam({ id: "location-court-home", name: "Atlética Local Casa" }),
      away_team: buildTeam({ id: "location-court-away", name: "Atlética Local Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-location-and-court",
      sport_id: "sport-location-and-court",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    expect(resolveMatchCardElement("Atlética Local Casa")).toHaveTextContent("Futevôlei • Arena Seven • Quadra Central");
  });

  it("mostra o estado ao vivo e salva o placar por pontos em autosave", async () => {
    const match = buildMatch({
      id: "live-points-match",
      sport_id: "sport-points",
      status: MatchStatus.LIVE,
      queue_position: 7,
      start_time: "2026-04-11T10:00:00.000Z",
      home_team: buildTeam({ id: "home-team", name: "Atlética Alpha" }),
      away_team: buildTeam({ id: "away-team", name: "Atlética Beta" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-points",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
      visualQueuePositionByMatchId: { "live-points-match": 1 },
    });
    const matchCardElement = resolveMatchCardElement("Atlética Alpha");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    expect(within(matchCardElement).getByText("● AO VIVO")).toBeInTheDocument();
    expect(within(matchCardElement).getByText("Jogo 1")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "3" },
      });
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.value).toBe("live-points-match");
    expect(supabaseUpdateCalls[0]?.payload.home_score).toBe(3);
    expect(supabaseUpdateCalls[0]?.payload.away_score).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.current_set_home_score).toBeNull();
    expect(supabaseUpdateCalls[0]?.payload.current_set_away_score).toBeNull();
  });

  it("mantém o placar digitado após autosave enquanto o backend não retorna novos dados", async () => {
    const match = buildMatch({
      id: "live-points-stale-props-match",
      sport_id: "sport-points",
      status: MatchStatus.LIVE,
      home_team: buildTeam({ id: "home-stale-team", name: "Atlética Persistência Casa" }),
      away_team: buildTeam({ id: "away-stale-team", name: "Atlética Persistência Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-points-stale-props",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Persistência Casa");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "12" },
      });
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload.home_score).toBe(12);
    expect(scoreInputs[0]).toHaveValue(12);
  });

  it("persiste rascunho pendente ao sair da tela de controle ao vivo", async () => {
    const match = buildMatch({
      id: "live-points-unmount-match",
      sport_id: "sport-points",
      status: MatchStatus.LIVE,
      home_team: buildTeam({ id: "home-unmount-team", name: "Atlética Persistir Casa" }),
      away_team: buildTeam({ id: "away-unmount-team", name: "Atlética Persistir Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-points-unmount",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: false,
    });
    const { unmount } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Persistir Casa");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "9" },
      });
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(0);

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload.home_score).toBe(9);
    expect(supabaseUpdateCalls[0]?.payload.away_score).toBe(0);
  });

  it("rehydrates placar salvo em sessão ao remontar controle com resposta stale do backend", async () => {
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-sets-session",
      sport_id: "sport-sets-session",
      result_rule: ChampionshipSportResultRule.SETS,
      supports_cards: false,
    });
    const staleMatch = buildMatch({
      id: "live-sets-session-stale-match",
      sport_id: "sport-sets-session",
      status: MatchStatus.LIVE,
      current_set_home_score: 0,
      current_set_away_score: 0,
      home_team: buildTeam({ id: "home-session-team", name: "Atlética Sessão Casa" }),
      away_team: buildTeam({ id: "away-session-team", name: "Atlética Sessão Visitante" }),
    });

    const firstRender = renderAdminMatchControl({
      matches: [staleMatch],
      championshipSports: [championshipSport],
    });
    const firstMatchCardElement = resolveMatchCardElement("Atlética Sessão Casa");
    const firstScoreInputs = within(firstMatchCardElement).getAllByRole("spinbutton");

    await act(async () => {
      fireEvent.change(firstScoreInputs[0] as HTMLElement, {
        target: { value: "14" },
      });
      await Promise.resolve();
    });

    await act(async () => {
      firstRender.unmount();
      await Promise.resolve();
    });

    renderAdminMatchControl({
      matches: [staleMatch],
      championshipSports: [championshipSport],
    });
    const secondMatchCardElement = resolveMatchCardElement("Atlética Sessão Casa");
    const secondScoreInputs = within(secondMatchCardElement).getAllByRole("spinbutton");

    expect(secondScoreInputs[0]).toHaveValue(14);
  });

  it("salva cartões em autosave apenas para modalidades com suporte", async () => {
    const match = buildMatch({
      id: "live-cards-match",
      sport_id: "sport-cards",
      status: MatchStatus.LIVE,
      supports_cards: true,
      home_team: buildTeam({ id: "home-cards-team", name: "Atlética Cartões" }),
      away_team: buildTeam({ id: "away-cards-team", name: "Atlética Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-cards",
      sport_id: "sport-cards",
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: true,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });
    const matchCardElement = resolveMatchCardElement("Atlética Cartões");
    const yellowCardSections = within(matchCardElement).getAllByText("Cartões Amarelos");
    const homeYellowCardSection = yellowCardSections[0]?.parentElement;

    if (!homeYellowCardSection) {
      throw new Error("Seção de cartões amarelos da casa não encontrada.");
    }
    const input = within(homeYellowCardSection as HTMLElement).getByRole("spinbutton");

    await act(async () => {
      fireEvent.change(input, {
        target: { value: "1" },
      });
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload.home_yellow_cards).toBe(1);
    expect(supabaseUpdateCalls[0]?.payload.home_red_cards).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.away_yellow_cards).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.away_red_cards).toBe(0);
  });

  it("reúne todos os controles disciplinares do handebol no mesmo painel", () => {
    const match = buildMatch({
      id: "live-handball-cards-match",
      sport_id: "sport-handball",
      status: MatchStatus.LIVE,
      supports_cards: true,
      sports: buildSport({ id: "sport-handball", name: "Handebol" }),
      home_team: buildTeam({ id: "home-handball-team", name: "Atlética Casa Handebol" }),
      away_team: buildTeam({ id: "away-handball-team", name: "Atlética Visitante Handebol" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-handball",
      sport_id: "sport-handball",
      supports_cards: true,
      sports: match.sports,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Casa Handebol");
    const panelWithYellowCards = within(matchCardElement)
      .getAllByText("Cartões Amarelos")[0]
      ?.closest(".glass-panel-muted");
    const panelWithBlueCards = within(matchCardElement)
      .getAllByText("Cartões Azuis")[0]
      ?.closest(".glass-panel-muted");
    const panelWithTwoMinutePenalties = within(matchCardElement)
      .getAllByText("Penalidades de 2 Min")[0]
      ?.closest(".glass-panel-muted");

    expect(panelWithYellowCards).not.toBeNull();
    expect(panelWithYellowCards).toHaveClass("after:border-l");
    expect(
      within(matchCardElement).getAllByText("Cartões Amarelos")[0],
    ).toHaveClass("dark:text-amber-500");
    expect(panelWithBlueCards).toBe(panelWithYellowCards);
    expect(panelWithTwoMinutePenalties).toBe(panelWithYellowCards);
    expect(
      within(panelWithYellowCards as HTMLElement).getAllByText(
        "Atlética Casa Handebol",
      ),
    ).toHaveLength(1);
    expect(
      within(panelWithYellowCards as HTMLElement).getAllByText(
        "Atlética Visitante Handebol",
      ),
    ).toHaveLength(1);
  });

  it("organiza os cartões em colunas por atlética no painel móvel", () => {
    const match = buildMatch({
      id: "live-mobile-cards-match",
      sport_id: "sport-futsal",
      status: MatchStatus.LIVE,
      supports_cards: true,
      sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
      home_team: buildTeam({ id: "home-mobile-cards-team", name: "Atlética Casa Futsal" }),
      away_team: buildTeam({ id: "away-mobile-cards-team", name: "Atlética Visitante Futsal" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-mobile-cards",
      sport_id: "sport-futsal",
      supports_cards: true,
      sports: match.sports,
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Casa Futsal");
    const mobilePanel = within(matchCardElement)
      .getAllByText("Amarelos")[0]
      ?.closest(".glass-panel-muted");

    expect(mobilePanel).not.toBeNull();
    expect(mobilePanel).toHaveClass("sm:hidden");
    expect(
      mobilePanel?.querySelector(".grid.grid-cols-2.divide-x"),
    ).not.toBeNull();
    expect(
      within(mobilePanel as HTMLElement).getByText("Atlética Casa Futsal"),
    ).toBeInTheDocument();
    expect(
      within(mobilePanel as HTMLElement).getByText("Atlética Visitante Futsal"),
    ).toBeInTheDocument();
  });

  it("mantém o botão Fim do set desabilitado com placar atual 0 x 0", () => {
    const match = buildMatch({
      id: "live-empty-set-score-match",
      sport_id: "sport-sets-empty",
      status: MatchStatus.LIVE,
      supports_cards: false,
      current_set_home_score: 0,
      current_set_away_score: 0,
      home_team: buildTeam({ id: "home-empty-set-score-team", name: "Atlética Set Vazio Casa" }),
      away_team: buildTeam({ id: "away-empty-set-score-team", name: "Atlética Set Vazio Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-sets-empty",
      sport_id: "sport-sets-empty",
      result_rule: ChampionshipSportResultRule.SETS,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Set Vazio Casa");

    expect(within(matchCardElement).getByRole("button", { name: /fim do set/i })).toBeDisabled();
  });

  it("habilita o botão Fim do set quando qualquer lado tem pontuação no draft", async () => {
    const match = buildMatch({
      id: "live-filled-set-score-match",
      sport_id: "sport-sets-filled",
      status: MatchStatus.LIVE,
      supports_cards: false,
      current_set_home_score: 0,
      current_set_away_score: 0,
      home_team: buildTeam({ id: "home-filled-set-score-team", name: "Atlética Set Preenchido Casa" }),
      away_team: buildTeam({ id: "away-filled-set-score-team", name: "Atlética Set Preenchido Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-sets-filled",
      sport_id: "sport-sets-filled",
      result_rule: ChampionshipSportResultRule.SETS,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Set Preenchido Casa");
    const finishSetButton = within(matchCardElement).getByRole("button", { name: /fim do set/i });
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    expect(finishSetButton).toBeDisabled();

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "1" },
      });
    });

    expect(finishSetButton).toBeEnabled();
  });

  it("fecha um set, salva os sets e atualiza vitórias de set no jogo ao vivo", async () => {
    const match = buildMatch({
      id: "live-sets-match",
      sport_id: "sport-sets",
      status: MatchStatus.LIVE,
      supports_cards: false,
      home_team: buildTeam({ id: "home-sets-team", name: "Atlética Sets Casa" }),
      away_team: buildTeam({ id: "away-sets-team", name: "Atlética Sets Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-sets",
      sport_id: "sport-sets",
      result_rule: ChampionshipSportResultRule.SETS,
    });
    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });
    const matchCardElement = resolveMatchCardElement("Atlética Sets Casa");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "21" },
      });
      fireEvent.change(scoreInputs[1] as HTMLElement, {
        target: { value: "15" },
      });
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /fim do set/i }));
      await Promise.resolve();
    });

    expect(saveMatchSetsMock).toHaveBeenCalledWith("live-sets-match", [
      {
        set_number: 1,
        home_points: 21,
        away_points: 15,
      },
    ]);
    expect(supabaseUpdateCalls.at(-1)?.payload).toMatchObject({
      home_score: 1,
      away_score: 0,
      current_set_home_score: 0,
      current_set_away_score: 0,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Set 1 encerrado.");
  });

  it("rehydrates set-rule draft from backend when match updates and draft is not dirty", async () => {
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-rehydrate",
      sport_id: "sport-sets",
      result_rule: ChampionshipSportResultRule.SETS,
    });
    const initialMatch = buildMatch({
      id: "rehydrate-live-sets-match",
      sport_id: "sport-sets",
      status: MatchStatus.LIVE,
      current_set_home_score: 0,
      current_set_away_score: 0,
      home_team: buildTeam({ id: "home-rehydrate-team", name: "Atlética Rehidratar Casa" }),
      away_team: buildTeam({ id: "away-rehydrate-team", name: "Atlética Rehidratar Visitante" }),
    });
    const updatedMatch = buildMatch({
      ...initialMatch,
      current_set_home_score: 7,
      current_set_away_score: 5,
    });

    const { rerenderAdminMatchControl } = renderAdminMatchControl({
      matches: [initialMatch],
      championshipSports: [championshipSport],
    });
    rerenderAdminMatchControl({
      matches: [updatedMatch],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Rehidratar Casa");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    expect(scoreInputs[0]).toHaveValue(7);
    expect(scoreInputs[1]).toHaveValue(5);
  });

  it("finaliza jogo por pontos e persiste status encerrado com placar final", async () => {
    const match = buildMatch({
      id: "finish-points-match",
      sport_id: "sport-points",
      status: MatchStatus.LIVE,
      start_time: "2026-04-11T10:00:00.000Z",
      home_score: 2,
      away_score: 1,
      home_team: buildTeam({ id: "home-finish-team", name: "Atlética Finalista Casa" }),
      away_team: buildTeam({ id: "away-finish-team", name: "Atlética Finalista Visitante" }),
    });
    const championshipSport = buildChampionshipSport({
      id: "championship-sport-finish-points",
      sport_id: "sport-points",
      result_rule: ChampionshipSportResultRule.POINTS,
    });
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /finalizar/i }));
    });
    await confirmFinishDialog();

    expect(supabaseUpdateCalls).toHaveLength(2);
    expect(supabaseUpdateCalls.at(-1)?.payload.status).toBe(MatchStatus.FINISHED);
    expect(supabaseUpdateCalls.at(-1)?.payload.home_score).toBe(2);
    expect(supabaseUpdateCalls.at(-1)?.payload.away_score).toBe(1);
    expect(typeof supabaseUpdateCalls.at(-1)?.payload.end_time).toBe("string");
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo finalizado! Classificação atualizada.");
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onRefetchChampionshipBracket).toHaveBeenCalledTimes(1);
  });
});
