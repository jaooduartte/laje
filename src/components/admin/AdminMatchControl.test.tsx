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
} = vi.hoisted(() => ({
  supabaseUpdateCalls: [] as SupabaseUpdateCall[],
  supabaseUpdateResults: [] as SupabaseUpdateResult[],
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  saveMatchSetsMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  saveMatchSets: (...args: unknown[]) => saveMatchSetsMock(...args),
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: () => <div data-testid="sport-filter-mock" />,
}));

vi.mock("@/components/ui/app-pagination-controls", () => ({
  DEFAULT_PAGINATION_ITEMS_PER_PAGE: 15,
  AppPaginationControls: () => <div data-testid="pagination-controls-mock" />,
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
}) {
  const onRefetch = vi.fn();
  const onRefetchChampionshipBracket = vi.fn();

  render(
    <AdminMatchControl
      matches={params.matches}
      championshipStatus={params.championshipStatus ?? ChampionshipStatus.IN_PROGRESS}
      championshipSports={params.championshipSports}
      championshipBracketView={buildChampionshipBracketView()}
      matchBracketContextByMatchId={{}}
      onRefetch={onRefetch}
      onRefetchChampionshipBracket={onRefetchChampionshipBracket}
      canManageScoreboard
    />,
  );

  return {
    onRefetch,
    onRefetchChampionshipBracket,
  };
}

function resolveMatchCardElement(teamName: string): HTMLElement {
  const teamLabel = screen.getAllByText(teamName)[0];
  const matchCardElement = teamLabel.closest(".list-item-card");

  if (!matchCardElement) {
    throw new Error(`Card do jogo não encontrado para ${teamName}.`);
  }

  return matchCardElement as HTMLElement;
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
    });
    const matchCardElement = resolveMatchCardElement("Atlética Alpha");
    const scoreInputs = within(matchCardElement).getAllByRole("spinbutton");

    expect(within(matchCardElement).getByText("● AO VIVO")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(scoreInputs[0] as HTMLElement, {
        target: { value: "3" },
      });
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.value).toBe("live-points-match");
    expect(supabaseUpdateCalls[0]?.payload.home_score).toBe(3);
    expect(supabaseUpdateCalls[0]?.payload.away_score).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.current_set_home_score).toBeNull();
    expect(supabaseUpdateCalls[0]?.payload.current_set_away_score).toBeNull();
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
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(supabaseUpdateCalls).toHaveLength(1);
    expect(supabaseUpdateCalls[0]?.payload.home_yellow_cards).toBe(1);
    expect(supabaseUpdateCalls[0]?.payload.home_red_cards).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.away_yellow_cards).toBe(0);
    expect(supabaseUpdateCalls[0]?.payload.away_red_cards).toBe(0);
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
