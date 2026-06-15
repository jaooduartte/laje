import { act } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMatchControl } from "@/components/admin/AdminMatchControl";
import {
  BracketEditionStatus,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import type {
  ChampionshipBracketView,
  ChampionshipSport,
  Match,
  Sport,
  Team,
} from "@/lib/types";

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
} = vi.hoisted(() => ({
  supabaseUpdateCalls: [] as SupabaseUpdateCall[],
  supabaseUpdateResults: [] as SupabaseUpdateResult[],
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  saveMatchSetsMock: vi.fn(),
  getBracketCourtSportsMock: vi.fn(() => new Promise(() => {})),
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

vi.mock("@/components/SportFilter", () => ({
  SportFilter: ({ sports, onSelect }: { sports: { id: string }[]; onSelect: (id: string | null) => void }) => (
    <button type="button" data-testid="sport-filter-mock" onClick={() => onSelect(sports[0]?.id ?? null)}>
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
    current_set_home_score: overrides.current_set_home_score ?? 0,
    current_set_away_score: overrides.current_set_away_score ?? 0,
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

function renderAdminMatchControl(params: {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  championshipStatus?: ChampionshipStatus;
  visualQueuePositionByMatchId?: Record<string, number>;
}) {
  const onRefetch = vi.fn();
  const onRefetchChampionshipBracket = vi.fn();
  const renderResult = render(
    <AdminMatchControl
      matches={params.matches}
      championshipStatus={params.championshipStatus ?? ChampionshipStatus.IN_PROGRESS}
      championshipSports={params.championshipSports}
      championshipBracketView={buildChampionshipBracketView()}
      matchBracketContextByMatchId={{}}
      visualQueuePositionByMatchId={params.visualQueuePositionByMatchId}
      onRefetch={onRefetch}
      onRefetchChampionshipBracket={onRefetchChampionshipBracket}
      canManageScoreboard
    />,
  );

  const rerenderAdminMatchControl = (nextParams: {
    matches: Match[];
    championshipSports: ChampionshipSport[];
    championshipStatus?: ChampionshipStatus;
    visualQueuePositionByMatchId?: Record<string, number>;
  }) => {
    renderResult.rerender(
      <AdminMatchControl
        matches={nextParams.matches}
        championshipStatus={nextParams.championshipStatus ?? ChampionshipStatus.IN_PROGRESS}
        championshipSports={nextParams.championshipSports}
        championshipBracketView={buildChampionshipBracketView()}
        matchBracketContextByMatchId={{}}
        visualQueuePositionByMatchId={nextParams.visualQueuePositionByMatchId}
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
  const matchCardElement = teamLabel.closest(".glass-card");

  if (!matchCardElement) {
    throw new Error(`Card do jogo não encontrado para ${teamName}.`);
  }

  return matchCardElement as HTMLElement;
}

function selectWalkoverOption(matchCardElement: HTMLElement, optionLabel: string): void {
  const walkoverSelectTrigger = within(matchCardElement).getByRole("combobox", { name: "W.O.?" });

  act(() => {
    fireEvent.click(walkoverSelectTrigger);
    vi.runOnlyPendingTimers();
  });

  const walkoverOption = screen.getByRole("option", { name: optionLabel });

  act(() => {
    fireEvent.click(walkoverOption);
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

  it("inicia um jogo agendado e envia status ao vivo para o backend", async () => {
    const match = buildMatch({
      id: "scheduled-match",
      sport_id: "sport-points",
      status: MatchStatus.SCHEDULED,
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
    expect(typeof supabaseUpdateCalls[0]?.payload.start_time).toBe("string");
    expect(toastSuccessMock).toHaveBeenCalledWith("Jogo iniciado!");
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
    });
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética WO Casa");
    selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });

    expect(saveMatchSetsMock).not.toHaveBeenCalled();
    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.value).toBe("scheduled-walkover-points-match");
    expect(supabaseUpdateCalls[0]?.payload).toMatchObject({
      home_score: 0,
      away_score: 3,
      status: MatchStatus.FINISHED,
      is_walkover: true,
      walkover_loser_team_id: homeTeam.id,
    });
    expect(typeof supabaseUpdateCalls[0]?.payload.start_time).toBe("string");
    expect(typeof supabaseUpdateCalls[0]?.payload.end_time).toBe("string");
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
    });

    renderAdminMatchControl({
      matches: [match],
      championshipSports: [championshipSport],
    });

    const matchCardElement = resolveMatchCardElement("Atlética Sets WO Casa");
    selectWalkoverOption(matchCardElement, awayTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });

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
      walkover_loser_team_id: awayTeam.id,
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
    selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });

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
    expect(within(resolveMatchCardElement("Atlética WO Visibilidade Encerrado")).queryByRole("combobox", { name: "W.O.?" })).toBeNull();
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
    selectWalkoverOption(matchCardElement, homeTeam.name);

    await act(async () => {
      fireEvent.click(within(matchCardElement).getByRole("button", { name: /encerrar w\.o\./i }));
    });

    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(toastErrorMock).toHaveBeenCalledWith("Só é possível aplicar W.O. quando o campeonato estiver Em andamento.");
  });

  it("atualiza os dados ao trocar a modalidade no filtro do controle ao vivo", async () => {
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

    expect(onRefetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("sport-filter-mock"));

    expect(onRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(onRefetch).toHaveBeenCalledTimes(2);
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

    fireEvent.click(screen.getByTestId("pagination-controls-page-mock"));

    expect(onRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(onRefetch).toHaveBeenCalledTimes(2);
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
    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
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
