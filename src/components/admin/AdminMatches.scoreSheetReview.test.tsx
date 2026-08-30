import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminMatches } from "@/components/admin/AdminMatches";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ChampionshipBracketTieBreakContextType,
  BracketEditionStatus,
  BracketPhase,
  BracketThirdPlaceMode,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchManualRepresentationMode,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import type {
  ChampionshipBracketEdition,
  Championship,
  ChampionshipBracketView,
  ChampionshipIndividualSession,
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
  getBracketCourtSportsMock,
  getBracketDaySchedulesMock,
  listEditableMatchScheduleSlotsMock,
  fetchPendingTieBreaksMock,
  fetchCorrectedGroupStandingsMock,
  generateChampionshipKnockoutMock,
  saveMatchSetsMock,
  saveTieBreakResolutionMock,
  updateBracketDayScheduleMock,
  updateScheduledMatchLogisticsMock,
  supabaseChannelMock,
  individualEventsState,
} = vi.hoisted(() => ({
  supabaseUpdateCalls: [] as SupabaseUpdateCall[],
  supabaseRpcCalls: [] as SupabaseRpcCall[],
  supabaseRpcResponses: [] as Array<{ data: unknown; error: { code?: string; message: string } | null }>,
  shouldDelaySupabaseUpdate: { value: false },
  resolveDelayedSupabaseUpdate: { current: null as (() => void) | null },
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  fetchLocationTemplatesMock: vi.fn(),
  getBracketCourtSportsMock: vi.fn(),
  getBracketDaySchedulesMock: vi.fn(),
  listEditableMatchScheduleSlotsMock: vi.fn(),
  fetchPendingTieBreaksMock: vi.fn(),
  fetchCorrectedGroupStandingsMock: vi.fn(),
  generateChampionshipKnockoutMock: vi.fn(),
  saveMatchSetsMock: vi.fn(),
  saveTieBreakResolutionMock: vi.fn(),
  updateBracketDayScheduleMock: vi.fn(),
  updateScheduledMatchLogisticsMock: vi.fn(),
  individualEventsState: {
    current: {
      sessions: [] as ChampionshipIndividualSession[],
    },
  },
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

vi.mock("@/hooks/useChampionshipIndividualEvents", () => ({
  useChampionshipIndividualEvents: () => individualEventsState.current,
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
  getBracketCourtSports: (...args: unknown[]) => getBracketCourtSportsMock(...args),
  getBracketDaySchedules: (...args: unknown[]) => getBracketDaySchedulesMock(...args),
  listEditableMatchScheduleSlots: (...args: unknown[]) => listEditableMatchScheduleSlotsMock(...args),
  fetchChampionshipBracketPendingTieBreaks: (...args: unknown[]) => fetchPendingTieBreaksMock(...args),
  fetchChampionshipCorrectedGroupStandings: (...args: unknown[]) => fetchCorrectedGroupStandingsMock(...args),
  generateChampionshipKnockout: (...args: unknown[]) => generateChampionshipKnockoutMock(...args),
  saveMatchSets: (...args: unknown[]) => saveMatchSetsMock(...args),
  saveChampionshipBracketTieBreakResolution: (...args: unknown[]) => saveTieBreakResolutionMock(...args),
  updateBracketDaySchedule: (...args: unknown[]) => updateBracketDayScheduleMock(...args),
  updateScheduledMatchLogistics: (...args: unknown[]) => updateScheduledMatchLogisticsMock(...args),
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
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
        in: async () => ({ error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "inserted-match" }, error: null }),
        }),
      }),
      select: () => {
        const selectBuilder = {
          eq: vi.fn(() => selectBuilder),
          order: vi.fn(() => ({
            limit: async () => ({ data: [], error: null }),
          })),
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        };

        return selectBuilder;
      },
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
    manual_representation_mode: overrides.manual_representation_mode ?? MatchManualRepresentationMode.AUTO,
    scheduled_date: overrides.scheduled_date ?? "2026-04-11",
    queue_position: overrides.queue_position ?? 1,
    scheduled_slot: overrides.scheduled_slot ?? null,
    is_manual_schedule_override:
      overrides.is_manual_schedule_override ?? false,
    is_pending_manual_relocation:
      overrides.is_pending_manual_relocation ?? false,
    pending_manual_relocation_reason:
      overrides.pending_manual_relocation_reason ?? null,
    pending_manual_relocation_notes:
      overrides.pending_manual_relocation_notes ?? null,
    pending_manual_relocation_previous_schedule:
      overrides.pending_manual_relocation_previous_schedule ?? null,
    pending_manual_relocation_previous_label:
      overrides.pending_manual_relocation_previous_label ?? null,
    pending_manual_relocation_created_by:
      overrides.pending_manual_relocation_created_by ?? null,
    pending_manual_relocation_at:
      overrides.pending_manual_relocation_at ?? null,
    current_set_home_score: overrides.current_set_home_score ?? null,
    current_set_away_score: overrides.current_set_away_score ?? null,
    is_walkover: overrides.is_walkover ?? false,
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
    home_blue_cards: overrides.home_blue_cards ?? 0,
    home_two_minute_penalties: overrides.home_two_minute_penalties ?? 0,
    away_score: overrides.away_score ?? 0,
    away_yellow_cards: overrides.away_yellow_cards ?? 0,
    away_red_cards: overrides.away_red_cards ?? 0,
    away_blue_cards: overrides.away_blue_cards ?? 0,
    away_two_minute_penalties: overrides.away_two_minute_penalties ?? 0,
    created_at: overrides.created_at ?? "2026-04-11T08:00:00.000Z",
    group_number: overrides.group_number ?? null,
    championships: overrides.championships ?? buildChampionship(),
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
    supports_individual_awards: overrides.supports_individual_awards ?? true,
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
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
  matchBracketContextByMatchId?: Record<string, { badgeLabel: string; phase: BracketPhase; stageLabel: string; groupFilterValue?: string; groupLabel?: string }>;
  selectedChampionship?: Championship;
  championshipSports?: ChampionshipSport[];
  canManageMatches?: boolean;
  hasMatchesEditPermission?: boolean;
}) {
  const onRefetch = vi.fn();
  const onRefetchChampionshipBracket = vi.fn();

  render(
    <TooltipProvider>
      <AdminMatches
        matches={params.matches}
        teams={params.matches.flatMap((match) => [match.home_team!, match.away_team!])}
        championshipSports={params.championshipSports ?? [buildChampionshipSport({ id: "championship-sport-1", sport_id: "sport-1" })]}
        selectedChampionship={params.selectedChampionship ?? buildChampionship()}
        championshipBracketView={params.bracketView ?? buildBracketView()}
        loadingChampionshipBracket={false}
        matchBracketContextByMatchId={params.matchBracketContextByMatchId ?? {}}
        matchRepresentationByMatchId={{}}
        visualQueuePositionByMatchId={params.visualQueuePositionByMatchId ?? {}}
        estimatedStartTimeByMatchId={params.estimatedStartTimeByMatchId ?? {}}
        isFetchingMatches={false}
        canManageMatches={params.canManageMatches ?? true}
        hasMatchesEditPermission={params.hasMatchesEditPermission}
        viewMode={params.viewMode ?? AdminMatchesViewMode.DEFAULT}
        onRefetch={onRefetch}
        onRefetchChampionshipBracket={onRefetchChampionshipBracket}
      />
    </TooltipProvider>,
  );

  return {
    onRefetch,
    onRefetchChampionshipBracket,
  };
}

function buildEditableScheduleSlots(date: string, currentSlotNumber = 1) {
  const slotLabels = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20"];

  return slotLabels.map((timeLabel, slotIndex) => ({
    slot_number: slotIndex + 1,
    start_time: `${date}T${timeLabel}:00.000Z`,
    start_time_label: timeLabel,
    is_current_slot: slotIndex + 1 == currentSlotNumber,
  }));
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
    getBracketCourtSportsMock.mockReset();
    getBracketDaySchedulesMock.mockReset();
    listEditableMatchScheduleSlotsMock.mockReset();
    fetchPendingTieBreaksMock.mockReset();
    fetchCorrectedGroupStandingsMock.mockReset();
    generateChampionshipKnockoutMock.mockReset();
    saveMatchSetsMock.mockReset();
    saveTieBreakResolutionMock.mockReset();
    updateBracketDayScheduleMock.mockReset();
    updateScheduledMatchLogisticsMock.mockReset();
    individualEventsState.current = { sessions: [] };
    supabaseChannelMock.on.mockClear();
    supabaseChannelMock.subscribe.mockClear();

    fetchLocationTemplatesMock.mockResolvedValue({ data: [], error: null });
    getBracketCourtSportsMock.mockResolvedValue({ data: [], error: null });
    getBracketDaySchedulesMock.mockResolvedValue({ data: [], error: null });
    listEditableMatchScheduleSlotsMock.mockResolvedValue({ data: [], error: null });
    fetchPendingTieBreaksMock.mockResolvedValue({ data: [], error: null });
    fetchCorrectedGroupStandingsMock.mockResolvedValue({ data: [], error: null });
    generateChampionshipKnockoutMock.mockResolvedValue({ data: null, error: null });
    saveMatchSetsMock.mockResolvedValue({ error: null });
    saveTieBreakResolutionMock.mockResolvedValue({ data: null, error: null });
    updateBracketDayScheduleMock.mockResolvedValue({ error: null });
    updateScheduledMatchLogisticsMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    shouldDelaySupabaseUpdate.value = false;
    resolveDelayedSupabaseUpdate.current = null;
    vi.clearAllMocks();
  });

  it("renderiza sem quebrar quando a aba abre antes da geração do campeonato", async () => {
    renderAdminMatches({
      matches: [],
      bracketView: buildBracketView(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("sport-filter-mock")).toBeInTheDocument();
    });
  });

  it("não informa falta de permissão quando a edição está bloqueada apenas pelo status", async () => {
    renderAdminMatches({
      matches: [],
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      canManageMatches: false,
      hasMatchesEditPermission: true,
    });

    await waitFor(() => {
      expect(
        screen.queryByText(
          "Perfil em visualização: sem permissão para criar, editar ou remover jogos.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("separa jogos guardados em uma subaba para realocação", async () => {
    renderAdminMatches({
      matches: [
        buildMatch({
          id: "pending-relocation-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          home_team: buildTeam({ id: "pending-home", name: "PENDENTE CASA" }),
          away_team: buildTeam({ id: "pending-away", name: "PENDENTE VISITANTE" }),
          is_pending_manual_relocation: true,
          pending_manual_relocation_previous_label: "Jogo 27",
          pending_manual_relocation_reason: "WEATHER",
          pending_manual_relocation_at: "2026-08-30T16:00:00.000Z",
          location: null,
          scheduled_date: null,
          court_name: null,
          start_time: null,
          end_time: null,
          queue_position: null,
          scheduled_slot: null,
        }),
        buildMatch({
          id: "active-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          home_team: buildTeam({ id: "active-home", name: "ATIVO CASA" }),
          away_team: buildTeam({ id: "active-away", name: "ATIVO VISITANTE" }),
        }),
      ],
    });

    expect(
      screen.getByRole("tab", { name: /Aguardando realocação 1/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PENDENTE CASA/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: /Aguardando realocação 1/ }),
    );

    await screen.findByText("Jogos aguardando realocação");

    expect(screen.getByText(/PENDENTE CASA/)).toBeInTheDocument();
    expect(screen.getByText("Jogo 27")).toBeInTheDocument();
    expect(screen.getByText("Condições climáticas")).toBeInTheDocument();
    expect(screen.getByText("1 jogo(s) encontrado(s)")).toBeInTheDocument();
  });

  it("mostra sessões individuais configuradas na aba Jogos", async () => {
    const athleticsSport = buildChampionshipSport({
      id: "championship-sport-athletics",
      sport_id: "sport-athletics",
      sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
    });
    individualEventsState.current = {
      sessions: [
        {
          id: "session-athletics",
          championship_id: "championship-1",
          season_year: 2026,
          sport_id: "sport-athletics",
          naipe: MatchNaipe.FEMININO,
          division: null,
          scheduled_date: "2026-04-11",
          period: "MATUTINO",
          location_key: "track",
          court_key: "lane-1",
          location_name: "Pista de Atletismo",
          court_name: "Raia 1",
          status: "SCHEDULED",
          exclusive_lock_enabled: true,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          sports: buildSport({ id: "sport-athletics", name: "Atletismo" }),
        },
      ],
    };

    renderAdminMatches({
      matches: [],
      championshipSports: [athleticsSport],
    });

    await waitFor(() => {
      expect(screen.getByText("Sessões Individuais")).toBeInTheDocument();
    });
    const sessionCard = screen
      .getByText("Sessão de provas")
      .closest(".list-item-card");

    expect(sessionCard).not.toBeNull();
    expect(screen.getByText("Atletismo")).toBeInTheDocument();
    expect(within(sessionCard as HTMLElement).getByText("Feminino")).toBeInTheDocument();
    expect(within(sessionCard as HTMLElement).getByText("Agendada")).toBeInTheDocument();
    expect(
      within(sessionCard as HTMLElement).getByText(/Pista de Atletismo.*Raia 1/),
    ).toBeInTheDocument();
    expect(
      within(sessionCard as HTMLElement).getByText("Data: 11/04/2026"),
    ).toBeInTheDocument();
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

  it("abre ocultando jogos revisados por padrão e permite exibi-los novamente", async () => {
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
      expect(screen.getByText("PENDENTE CASA")).toBeInTheDocument();
    });

    expect(screen.queryByText("REVISADO CASA")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar jogos revisados também")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Mostrar jogos revisados também"));

    expect(screen.getByText("REVISADO CASA")).toBeInTheDocument();
    expect(screen.getByText("PENDENTE CASA")).toBeInTheDocument();
  });

  it("abre revisão de súmula e salva premiações antes de marcar como revisado", async () => {
    supabaseRpcResponses.push(
      {
        data: {
          match_id: "match-1",
          home_team_id: "team-1-home",
          away_team_id: "team-1-away",
          required_home_goals: 0,
          required_away_goals: 0,
          is_walkover: false,
          home_players: [{ id: "home-player-1", name: "Atleta Casa" }],
          away_players: [{ id: "away-player-1", name: "Atleta Visitante" }],
          home_goals: [],
          away_goals: [],
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "society-football",
          sport_id: "sport-football-society",
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
        }),
      ],
      matches: [
        buildMatch({
          id: "match-1",
          sport_id: "sport-football-society",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: false,
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
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
    expect(screen.queryByText("Goleiros")).not.toBeInTheDocument();
    expect(screen.queryByText("Goleiro")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar revisão" }));

    await waitFor(() => {
      expect(supabaseRpcCalls.some((rpcCall) => rpcCall.functionName == "save_match_score_sheet_awards")).toBe(true);
    });

    expect(
      supabaseRpcCalls.find(
        (rpcCall) => rpcCall.functionName == "save_match_score_sheet_awards" && rpcCall.payload._match_id == "match-1",
      )?.payload,
    ).toMatchObject({
      _match_id: "match-1",
      _home_goal_scorers: [],
      _away_goal_scorers: [],
    });

    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("mostra aviso de que pênaltis não entram na artilharia na revisão de súmula", async () => {
    supabaseRpcResponses.push({
      data: {
        match_id: "society-score-sheet-match",
        home_team_id: "team-1-home",
        away_team_id: "team-1-away",
        required_home_goals: 2,
        required_away_goals: 2,
        is_walkover: false,
        home_players: [],
        away_players: [],
        home_goals: [],
        away_goals: [],
      },
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      matchBracketContextByMatchId: {
        "society-score-sheet-match": {
          badgeLabel: "Semifinal",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Semifinal",
        },
      },
      matches: [
        buildMatch({
          id: "society-score-sheet-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_score: 2,
          away_score: 2,
          home_penalty_score: 4,
          away_penalty_score: 3,
          championships: buildChampionship({
            code: ChampionshipCode.SOCIETY,
            name: "Copa Laje Society",
          }),
          sports: buildSport({ id: "sport-1", name: "Futebol Society" }),
          home_team: buildTeam({ id: "team-1-home", name: "PENALTY CASA" }),
          away_team: buildTeam({ id: "team-1-away", name: "PENALTY VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo PENALTY CASA x PENALTY VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("PENALTY CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Revisar súmula e premiações");

    expect(
      await screen.findByText(
        "Os pênaltis desempataram o jogo, mas não entram na artilharia. Informe apenas os autores dos gols do tempo normal.",
      ),
    ).toBeInTheDocument();
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

  it("permite marcar em lote jogos do Interlaje sem exigir autores dos gols", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.INTERLAJE,
        name: "Interlaje",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "interlaje-futsal",
          sport_id: "sport-futsal",
          supports_individual_awards: true,
          sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
        }),
      ],
      matches: [
        buildMatch({
          id: "interlaje-futsal-match",
          sport_id: "sport-futsal",
          status: MatchStatus.FINISHED,
          home_score: 7,
          away_score: 0,
          sports: buildSport({ id: "sport-futsal", name: "Futsal" }),
          home_team: buildTeam({ id: "interlaje-home", name: "INTERLAJE CASA" }),
          away_team: buildTeam({ id: "interlaje-away", name: "INTERLAJE VISITANTE" }),
        }),
      ],
    });

    const selectAllLabel = screen.getByText("Selecionar todos os jogos filtrados");
    const selectAllCheckboxButton = selectAllLabel.parentElement?.querySelector<HTMLElement>(
      '[role="checkbox"]',
    );
    expect(selectAllCheckboxButton).not.toBeNull();
    fireEvent.click(selectAllCheckboxButton as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "Marcar selecionados como revisados" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls).toHaveLength(1);
    });

    expect(supabaseUpdateCalls[0]).toMatchObject({
      method: "eq",
      ids: ["interlaje-futsal-match"],
      payload: { is_score_sheet_reviewed: true },
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("mantém a revisão individual obrigatória em lote para Futebol Society da Copa Laje Society", () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "society-football",
          sport_id: "sport-football-society",
          supports_individual_awards: true,
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
        }),
      ],
      matches: [
        buildMatch({
          id: "society-football-match",
          sport_id: "sport-football-society",
          status: MatchStatus.FINISHED,
          home_score: 2,
          away_score: 1,
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
        }),
      ],
    });

    const selectAllLabel = screen.getByText("Selecionar todos os jogos filtrados");
    const selectAllCheckboxButton = selectAllLabel.parentElement?.querySelector<HTMLElement>(
      '[role="checkbox"]',
    );
    expect(selectAllCheckboxButton).not.toBeNull();
    fireEvent.click(selectAllCheckboxButton as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "Marcar selecionados como revisados" }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Para marcar como revisado, use a revisão individual de súmula para registrar os autores dos gols.",
    );
    expect(supabaseUpdateCalls).toHaveLength(0);
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

  it("centraliza o badge mobile de naipe e mantém altura padronizada", async () => {
    await act(async () => {
      renderAdminMatches({
        viewMode: AdminMatchesViewMode.DEFAULT,
        matches: [
          buildMatch({
            id: "mobile-naipe-badge",
            sport_id: "sport-1",
            status: MatchStatus.SCHEDULED,
            naipe: MatchNaipe.MASCULINO,
            home_team: buildTeam({ id: "team-mobile-badge-home", name: "BADGE CASA" }),
            away_team: buildTeam({ id: "team-mobile-badge-away", name: "BADGE VISITANTE" }),
          }),
        ],
      });
      await Promise.resolve();
    });

    const matchCardContainer = getMatchCardContainerByTeamName("BADGE CASA");
    const naipeIcon = within(matchCardContainer).getByText("♂");
    const naipeBadge = naipeIcon.closest("div");

    expect(naipeBadge).toHaveClass("min-h-6", "min-w-10", "justify-center");
    expect(naipeIcon).toHaveClass("leading-none");
  });

  it("exibe cartões azuis somente nos cards de Handebol", async () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "handball-blue-cards",
          sport_id: "sport-handball",
          status: MatchStatus.SCHEDULED,
          supports_cards: true,
          sports: buildSport({ id: "sport-handball", name: "Handebol" }),
          home_blue_cards: 1,
          away_blue_cards: 2,
          home_team: buildTeam({ id: "team-blue-home", name: "AZUL CASA" }),
          away_team: buildTeam({ id: "team-blue-away", name: "AZUL VISITANTE" }),
        }),
      ],
    });

    const matchCardContainer = getMatchCardContainerByTeamName("AZUL CASA");

    expect(
      within(matchCardContainer).getByTestId("admin-match-home-blue-cards"),
    ).toHaveTextContent("1");
    expect(
      within(matchCardContainer).getByTestId("admin-match-away-blue-cards"),
    ).toHaveTextContent("2");
    expect(within(matchCardContainer).queryByText(/CAZ:/)).not.toBeInTheDocument();
    expect(within(matchCardContainer).queryByText(/2M:/)).not.toBeInTheDocument();
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

  it("mantém a ordem por horário e apenas troca a numeração visual da quadra nos cards agendados", () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "court-a-game-1",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 1,
          scheduled_slot: 1,
          home_team: buildTeam({ id: "court-a-game-1-home", name: "TAUROS" }),
          away_team: buildTeam({ id: "court-a-game-1-away", name: "CAMALEÃO" }),
        }),
        buildMatch({
          id: "court-a-game-2",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 2,
          scheduled_slot: 2,
          home_team: buildTeam({ id: "court-a-game-2-home", name: "AAASF" }),
          away_team: buildTeam({ id: "court-a-game-2-away", name: "RASANTE" }),
        }),
        buildMatch({
          id: "court-a-game-4",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 3,
          scheduled_slot: 3,
          home_team: buildTeam({ id: "court-a-game-4-home", name: "GARRUDOS" }),
          away_team: buildTeam({ id: "court-a-game-4-away", name: "RASANTE B" }),
        }),
        buildMatch({
          id: "court-a-game-3",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 4,
          scheduled_slot: 4,
          home_team: buildTeam({ id: "court-a-game-3-home", name: "CAMALEÃO B" }),
          away_team: buildTeam({ id: "court-a-game-3-away", name: "RAPOSAS" }),
        }),
      ],
      visualQueuePositionByMatchId: {
        "court-a-game-1": 1,
        "court-a-game-2": 2,
        "court-a-game-4": 3,
        "court-a-game-3": 4,
      },
      estimatedStartTimeByMatchId: {
        "court-a-game-1": "08:00",
        "court-a-game-2": "08:40",
        "court-a-game-4": "09:20",
        "court-a-game-3": "10:00",
      },
    });

    const gameThreeCard = getMatchCardContainerByTeamName("CAMALEÃO B");
    const gameFourCard = getMatchCardContainerByTeamName("GARRUDOS");

    expect(gameFourCard.compareDocumentPosition(gameThreeCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gameFourCard).toHaveTextContent("Jogo 3");
    expect(gameFourCard).toHaveTextContent("Horário estimado: 09:20");
    expect(gameThreeCard).toHaveTextContent("Jogo 4");
    expect(gameThreeCard).toHaveTextContent("Horário estimado: 10:00");
  });

  it("mostra o slot visual correto mesmo quando o queue_position legado está diferente", () => {
    renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      matches: [
        buildMatch({
          id: "legacy-queue-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          queue_position: 7,
          scheduled_slot: 1,
          home_team: buildTeam({ id: "legacy-home", name: "AAAUS" }),
          away_team: buildTeam({ id: "legacy-away", name: "RASANTE" }),
        }),
      ],
      visualQueuePositionByMatchId: {
        "legacy-queue-match": 1,
      },
      estimatedStartTimeByMatchId: {
        "legacy-queue-match": "08:10",
      },
    });

    const matchCard = getMatchCardContainerByTeamName("AAAUS");

    expect(matchCard).toHaveTextContent("Jogo 1");
    expect(matchCard).not.toHaveTextContent("Jogo 7");
    expect(matchCard).toHaveTextContent("Horário estimado: 08:10");
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

  it("mantém as atléticas vinculadas ao editar jogo sem divisão", async () => {
    renderAdminMatches({
      selectedChampionship: buildChampionship({ uses_divisions: true }),
      matches: [
        buildMatch({
          id: "legacy-division-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          division: null,
          court_name: "Quadra 1",
          home_team: buildTeam({
            id: "legacy-access-team",
            name: "CASA ACESSO",
            division: TeamDivision.DIVISAO_ACESSO,
          }),
          away_team: buildTeam({
            id: "legacy-principal-team",
            name: "VISITANTE PRINCIPAL",
            division: TeamDivision.DIVISAO_PRINCIPAL,
          }),
        }),
      ],
    });

    fireEvent.pointerDown(
      await screen.findByLabelText(
        "Ações do jogo CASA ACESSO x VISITANTE PRINCIPAL",
      ),
    );
    clickFirstMenuItemInMatchCard(
      getMatchCardContainerByTeamName("CASA ACESSO"),
      "Editar",
    );

    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByRole("combobox", { name: "Divisão do jogo" }),
    ).toHaveTextContent("Sem divisão");
    expect(
      within(dialog).getByRole("combobox", { name: "Atlética da casa" }),
    ).toHaveTextContent("CASA ACESSO");
    expect(
      within(dialog).getByRole("combobox", { name: "Atlética visitante" }),
    ).toHaveTextContent("VISITANTE PRINCIPAL");
  });

  it("encerra o carregamento de horários quando a consulta falha", async () => {
    listEditableMatchScheduleSlotsMock.mockRejectedValueOnce(
      new Error("Falha ao carregar horários"),
    );

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "schedule-slots-error-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra 1",
          home_team: buildTeam({ id: "schedule-error-home", name: "CASA HORÁRIO" }),
          away_team: buildTeam({ id: "schedule-error-away", name: "VISITANTE HORÁRIO" }),
        }),
      ],
    });

    fireEvent.pointerDown(
      await screen.findByLabelText(
        "Ações do jogo CASA HORÁRIO x VISITANTE HORÁRIO",
      ),
    );
    clickFirstMenuItemInMatchCard(
      getMatchCardContainerByTeamName("CASA HORÁRIO"),
      "Editar",
    );

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Falha ao carregar horários");
    });

    expect(screen.queryByText("Carregando horários")).not.toBeInTheDocument();
  });

  it("abre modal de troca e chama RPC para swap de fila", async () => {
    const { onRefetch, onRefetchChampionshipBracket } = renderAdminMatches({
      viewMode: AdminMatchesViewMode.DEFAULT,
      visualQueuePositionByMatchId: {
        "swap-source-match": 18,
        "swap-target-match": 20,
      },
      matches: [
        buildMatch({
          id: "swap-source-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra B",
          start_time: "2026-04-12T08:00:00.000Z",
          queue_position: 1,
          scheduled_slot: 1,
          home_team: buildTeam({ id: "swap-source-home", name: "ORIGEM CASA" }),
          away_team: buildTeam({ id: "swap-source-away", name: "ORIGEM VISITANTE" }),
        }),
        buildMatch({
          id: "swap-ineligible-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          naipe: MatchNaipe.FEMININO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          scheduled_date: "2026-04-12",
          location: "Arena Seven",
          court_name: "Quadra A",
          start_time: "2026-04-12T09:20:00.000Z",
          queue_position: 3,
          scheduled_slot: 3,
          home_team: buildTeam({ id: "swap-ineligible-home", name: "OUTRO CASA" }),
          away_team: buildTeam({ id: "swap-ineligible-away", name: "OUTRO VISITANTE" }),
        }),
      ],
    });

    supabaseRpcResponses.push({
      data: [
        {
          match_id: "swap-target-match",
          scheduled_date: "2026-04-13",
          start_time: "2026-04-13T08:40:00.000Z",
          queue_position: 2,
          scheduled_slot: 2,
          created_at: "2026-04-01T00:00:00.000Z",
          home_team_name: "CANDIDATO CASA",
          away_team_name: "CANDIDATO VISITANTE",
          uses_reduced_cross_sport_rest_gap: true,
        },
      ],
      error: null,
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
    expect(await screen.findByText("12/04 • 05:00 • Jogo 18 • ORIGEM CASA x ORIGEM VISITANTE")).toBeInTheDocument();
    await waitFor(() => {
      expect(supabaseRpcCalls[0]).toMatchObject({
        functionName: "list_match_queue_swap_candidates",
        payload: {
          _source_match_id: "swap-source-match",
        },
      });
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Selecionar jogo para troca de fila" }));
    expect((await screen.findAllByText("13/04 • 05:40 • Jogo 20 • CANDIDATO CASA x CANDIDATO VISITANTE")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Descanso reduzido: outra modalidade")).toBeInTheDocument();
    expect(screen.queryByText("12/04 • Jogo 3 • OUTRO CASA x OUTRO VISITANTE")).not.toBeInTheDocument();

    fireEvent.click((await screen.findAllByText("13/04 • 05:40 • Jogo 20 • CANDIDATO CASA x CANDIDATO VISITANTE"))[0]);

    onRefetch.mockClear();
    onRefetchChampionshipBracket.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar troca" }));

    await waitFor(() => {
      expect(supabaseRpcCalls.length).toBe(2);
    });

    expect(supabaseRpcCalls[1]).toMatchObject({
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

  it("filtra jogos pela data cadastrada no campeonato", async () => {
    renderAdminMatches({
      bracketView: buildBracketView({
        edition: buildBracketEdition({
          payload_snapshot: {
            schedule_days: [
              { date: "2026-04-11", locations: [] },
              { date: "2026-04-12", locations: [] },
            ],
          },
        }),
      }),
      matches: [
        buildMatch({
          id: "date-filter-first-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-11",
          home_team: buildTeam({ id: "date-filter-first-home", name: "DATA PRIMEIRO" }),
          away_team: buildTeam({ id: "date-filter-first-away", name: "DATA PRIMEIRO VISITANTE" }),
        }),
        buildMatch({
          id: "date-filter-second-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          scheduled_date: "2026-04-12",
          home_team: buildTeam({ id: "date-filter-second-home", name: "DATA SEGUNDO" }),
          away_team: buildTeam({ id: "date-filter-second-away", name: "DATA SEGUNDO VISITANTE" }),
        }),
      ],
    });

    expect(await screen.findByText("DATA PRIMEIRO")).toBeInTheDocument();
    expect(screen.getByText("DATA SEGUNDO")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Todas as datas"));
    fireEvent.click(await screen.findByText("12/04/2026"));

    await waitFor(() => {
      expect(screen.queryByText("DATA PRIMEIRO")).not.toBeInTheDocument();
      expect(screen.getByText("DATA SEGUNDO")).toBeInTheDocument();
    });
  });

  it("abre confirmação ao salvar edição de jogo revisado e permite remover a revisão", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "reviewed-edit-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: true,
          court_name: "Quadra 1",
          start_time: "2026-04-11T08:00:00.000Z",
          scheduled_slot: 1,
          home_team: buildTeam({ id: "team-reviewed-edit-home", name: "EDIT CASA" }),
          away_team: buildTeam({ id: "team-reviewed-edit-away", name: "EDIT VISITANTE" }),
        }),
      ],
    });

    fireEvent.click(await screen.findByLabelText("Mostrar jogos revisados também"));

    const actionsButton = await screen.findByLabelText("Ações do jogo EDIT CASA x EDIT VISITANTE");
    fireEvent.pointerDown(actionsButton);
    const matchCardContainer = getMatchCardContainerByTeamName("EDIT CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(await screen.findByText("Jogo 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Jogo já revisado na súmula")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar e remover revisão" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("queue_position");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_slot");
    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      is_score_sheet_reviewed: false,
    });
  });

  it("preserva o número legado da fila ao editar apenas o placar de um jogo encerrado", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      matches: [
        buildMatch({
          id: "finished-queue-legacy-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          court_name: "Quadra B",
          start_time: "2026-04-11T08:00:00.000Z",
          queue_position: 6,
          scheduled_slot: null,
          home_team: buildTeam({ id: "team-finished-queue-home", name: "AFA" }),
          away_team: buildTeam({ id: "team-finished-queue-away", name: "AAJ" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo AFA x AAJ"));
    const matchCardContainer = getMatchCardContainerByTeamName("AFA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(await screen.findByText("Jogo 6")).toBeInTheDocument();

    Array.from({ length: 5 }).forEach(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Aumentar placar de AFA" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      home_score: 5,
    });
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_slot");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("location");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_date");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("manual_representation_mode");
  });

  it("mostra o indicador de pênaltis no card admin quando o mata-mata da Society foi decidido nos pênaltis", async () => {
    renderAdminMatches({
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      matchBracketContextByMatchId: {
        "society-card-penalties-match": {
          badgeLabel: "Final",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Final",
        },
      },
      matches: [
        buildMatch({
          id: "society-card-penalties-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          home_score: 2,
          away_score: 2,
          home_penalty_score: 4,
          away_penalty_score: 3,
          championships: buildChampionship({
            code: ChampionshipCode.SOCIETY,
            name: "Copa Laje Society",
          }),
          sports: buildSport({ id: "sport-1", name: "Futebol Society" }),
          home_team: buildTeam({ id: "society-card-home", name: "CARD PEN CASA" }),
          away_team: buildTeam({ id: "society-card-away", name: "CARD PEN VISITANTE" }),
        }),
      ],
    });

    expect(await screen.findByText("Pênaltis: (4 × 3)")).toBeInTheDocument();
  });

  it("salva os pênaltis e o vencedor oficial na edição de jogo da Society", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "championship-sport-society-edit",
          sport_id: "sport-1",
          tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
        }),
      ],
      matchBracketContextByMatchId: {
        "society-finished-edit-match": {
          badgeLabel: "Semifinal",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Semifinal",
        },
      },
      matches: [
        buildMatch({
          id: "society-finished-edit-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          court_name: "Quadra Society",
          start_time: "2026-04-11T08:00:00.000Z",
          home_score: 2,
          away_score: 2,
          championships: buildChampionship({
            code: ChampionshipCode.SOCIETY,
            name: "Copa Laje Society",
          }),
          sports: buildSport({ id: "sport-1", name: "Futebol Society" }),
          home_team: buildTeam({ id: "society-edit-home", name: "EDIT PEN CASA" }),
          away_team: buildTeam({ id: "society-edit-away", name: "EDIT PEN VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo EDIT PEN CASA x EDIT PEN VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("EDIT PEN CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.change(screen.getByRole("spinbutton", { name: "Pênaltis da casa" }), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Pênaltis do visitante" }), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      home_penalty_score: 4,
      away_penalty_score: 3,
      resolved_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
      resolved_tie_break_winner_team_id: "society-edit-home",
    });
  });

  it("limpa os pênaltis ao desfazer o empate do tempo normal na edição", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "championship-sport-society-clear",
          sport_id: "sport-1",
          tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
        }),
      ],
      matchBracketContextByMatchId: {
        "society-clear-penalties-match": {
          badgeLabel: "Final",
          phase: BracketPhase.KNOCKOUT,
          stageLabel: "Final",
        },
      },
      matches: [
        buildMatch({
          id: "society-clear-penalties-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          court_name: "Quadra Society",
          start_time: "2026-04-11T08:00:00.000Z",
          home_score: 2,
          away_score: 2,
          home_penalty_score: 5,
          away_penalty_score: 4,
          resolved_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
          resolved_tie_break_winner_team_id: "society-clear-home",
          championships: buildChampionship({
            code: ChampionshipCode.SOCIETY,
            name: "Copa Laje Society",
          }),
          sports: buildSport({ id: "sport-1", name: "Futebol Society" }),
          home_team: buildTeam({ id: "society-clear-home", name: "CLEAR PEN CASA" }),
          away_team: buildTeam({ id: "society-clear-away", name: "CLEAR PEN VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo CLEAR PEN CASA x CLEAR PEN VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("CLEAR PEN CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(screen.getByRole("spinbutton", { name: "Pênaltis da casa" })).toHaveValue(5);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Aumentar placar de CLEAR PEN CASA",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("spinbutton", { name: "Pênaltis da casa" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      home_score: 3,
      away_score: 2,
      home_penalty_score: null,
      away_penalty_score: null,
      resolved_tie_breaker_rule: null,
      resolved_tie_break_winner_team_id: null,
    });
  });

  it("não faz write ao salvar um jogo encerrado sem alterações", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "finished-noop-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          court_name: "Quadra B",
          start_time: "2026-04-11T08:00:00.000Z",
          queue_position: 6,
          scheduled_slot: null,
          home_team: buildTeam({ id: "team-finished-noop-home", name: "SEM MUDANCA CASA" }),
          away_team: buildTeam({ id: "team-finished-noop-away", name: "SEM MUDANCA VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo SEM MUDANCA CASA x SEM MUDANCA VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("SEM MUDANCA CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Jogo atualizado.");
    });

    expect(supabaseUpdateCalls).toHaveLength(0);
    expect(updateScheduledMatchLogisticsMock).not.toHaveBeenCalled();
  });

  it("limpa o horário final herdado ao iniciar um jogo agendado", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 2),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "scheduled-live-transition-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra C",
          start_time: "2026-04-11T08:40:00.000Z",
          end_time: "2026-04-11T08:00:00.000Z",
          scheduled_slot: 2,
          home_team: buildTeam({ id: "team-live-transition-home", name: "ACATO" }),
          away_team: buildTeam({ id: "team-live-transition-away", name: "SOBERANOS" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo ACATO x SOBERANOS"));
    const matchCardContainer = getMatchCardContainerByTeamName("ACATO");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.click(screen.getByRole("combobox", { name: "Status do jogo" }));
    fireEvent.click(await screen.findByText("Ao vivo"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      status: MatchStatus.LIVE,
      start_time: "2026-04-11T08:40:00.000Z",
      end_time: null,
    });
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_slot");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("location");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_date");
  });

  it("reabre jogo encerrado como ao vivo sem sobrescrever agenda nem placar", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 2),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "finished-live-reopen-match",
          sport_id: "sport-1",
          status: MatchStatus.FINISHED,
          court_name: "Quadra C",
          start_time: "2026-04-11T08:40:00.000Z",
          end_time: "2026-04-11T09:15:00.000Z",
          home_score: 2,
          away_score: 1,
          home_penalty_score: 4,
          away_penalty_score: 2,
          home_yellow_cards: 1,
          away_red_cards: 1,
          is_score_sheet_reviewed: true,
          resolved_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
          resolved_tie_break_winner_team_id: "team-live-reopen-home",
          scheduled_slot: 2,
          home_team: buildTeam({ id: "team-live-reopen-home", name: "REABRIR CASA" }),
          away_team: buildTeam({ id: "team-live-reopen-away", name: "REABRIR VISITANTE" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo REABRIR CASA x REABRIR VISITANTE"));
    const matchCardContainer = getMatchCardContainerByTeamName("REABRIR CASA");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(
      screen.getByRole("button", {
        name: "Aumentar cartões amarelos de REABRIR CASA",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Aumentar cartões vermelhos de REABRIR VISITANTE",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Status do jogo" }));
    fireEvent.click(await screen.findByRole("option", { name: "Ao vivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Jogo já revisado na súmula")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar e remover revisão" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls.length).toBeGreaterThan(0);
    });

    expect(supabaseUpdateCalls[0].payload).toMatchObject({
      status: MatchStatus.LIVE,
      start_time: "2026-04-11T08:40:00.000Z",
      end_time: null,
      is_score_sheet_reviewed: false,
      home_penalty_score: null,
      away_penalty_score: null,
      resolved_tie_breaker_rule: null,
      resolved_tie_break_winner_team_id: null,
      is_walkover: false,
      is_double_walkover: false,
      walkover_loser_team_id: null,
    });
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_slot");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("location");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("scheduled_date");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("home_score");
    expect(supabaseUpdateCalls[0].payload).not.toHaveProperty("away_score");
  });

  it("mantém o salvar desabilitado até preencher autores dos gols pendentes", async () => {
    supabaseRpcResponses.push(
      {
        data: {
          match_id: "review-loader-match",
          home_team_id: "team-review-loader-home",
          away_team_id: "team-review-loader-away",
          required_home_goals: 1,
          required_away_goals: 0,
          is_walkover: false,
          home_players: [{ id: "home-player-2", name: "Atacante Casa" }],
          away_players: [{ id: "away-player-2", name: "Atleta Visitante" }],
          home_goals: [],
          away_goals: [],
        },
        error: null,
      },
    );

    renderAdminMatches({
      viewMode: AdminMatchesViewMode.SCORE_SHEET_REVIEW,
      selectedChampionship: buildChampionship({
        code: ChampionshipCode.SOCIETY,
        name: "Copa Laje Society",
      }),
      championshipSports: [
        buildChampionshipSport({
          id: "society-football",
          sport_id: "sport-football-society",
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
        }),
      ],
      matches: [
        buildMatch({
          id: "review-loader-match",
          sport_id: "sport-football-society",
          status: MatchStatus.FINISHED,
          is_score_sheet_reviewed: false,
          sports: buildSport({
            id: "sport-football-society",
            name: "Futebol Society",
          }),
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
    const saveButton = screen.getByRole("button", { name: "Salvar revisão" });

    expect(saveButton).toBeDisabled();
    expect(screen.getByText("Faltam 1 autor de gol para liberar o salvamento.")).toBeInTheDocument();
    expect(screen.getByText("0 de 1 gols preenchidos nesta revisão.")).toBeInTheDocument();
    expect(screen.getByText("0 de 1 gols vinculados • faltam 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "LOADER CASA gol 1" }));
    fireEvent.click(await screen.findByRole("option", { name: "Atacante Casa" }));

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    expect(screen.getByText("Todos os autores dos gols foram vinculados.")).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(
        supabaseRpcCalls.some((rpcCall) => rpcCall.functionName == "save_match_score_sheet_awards" && rpcCall.payload._match_id == "review-loader-match"),
      ).toBe(true);
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
    expect(within(contextCard).getByRole("columnheader", { name: "CAZ" })).toBeInTheDocument();
    expect(within(contextCard).getByRole("columnheader", { name: "2M" })).toBeInTheDocument();
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

  it("exibe o horário persistido de uma realocação manual fora da grade regular", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "manual-relocation-edit-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra 1",
          start_time: "2026-04-11T19:17:00+00:00",
          queue_position: 24,
          scheduled_slot: 24,
          is_manual_schedule_override: true,
          home_team: buildTeam({ id: "manual-home", name: "CASA MANUAL" }),
          away_team: buildTeam({
            id: "manual-away",
            name: "VISITANTE MANUAL",
          }),
        }),
      ],
      estimatedStartTimeByMatchId: {
        "manual-relocation-edit-match": "19:17",
      },
    });

    fireEvent.pointerDown(
      await screen.findByLabelText(
        "Ações do jogo CASA MANUAL x VISITANTE MANUAL",
      ),
    );
    const matchCardContainer = getMatchCardContainerByTeamName("CASA MANUAL");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(
      await screen.findByRole("combobox", {
        name: "Horário estimado do jogo",
      }),
    ).toHaveTextContent("19:17");
  });

  it("ao editar a logística de um jogo agendado usa o RPC autoritativo de slots", async () => {
    getBracketCourtSportsMock.mockResolvedValue({
      data: [
        {
          bracket_day_id: "day-1",
          event_date: "2026-04-11",
          locations: [
            {
              id: "location-1",
              name: "Praia de Piçarras",
              position: 1,
              courts: [
                {
                  id: "court-1",
                  name: "Quadra 1",
                  position: 1,
                  sports: [{ sport_id: "sport-1" }],
                },
              ],
            },
          ],
        },
      ],
      error: null,
    });
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 5),
      error: null,
    });
    getBracketDaySchedulesMock.mockResolvedValue({
      data: [
        {
          id: "day-1",
          event_date: "2026-04-11",
          start_time: "08:00",
          end_time: "18:00",
          breaks: [],
          courts: [],
        },
      ],
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "edit-game-slot-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra 1",
          start_time: "2026-04-11T14:10:00.000Z",
          queue_position: 17,
          scheduled_slot: 17,
          home_team: buildTeam({ id: "edit-slot-home", name: "CASA SLOT" }),
          away_team: buildTeam({ id: "edit-slot-away", name: "VISITANTE SLOT" }),
        }),
      ],
      bracketView: buildBracketView({
        edition: buildBracketEdition(),
      }),
      estimatedStartTimeByMatchId: {
        "edit-game-slot-match": "10:40",
      },
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo CASA SLOT x VISITANTE SLOT"));
    const matchCardContainer = getMatchCardContainerByTeamName("CASA SLOT");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(await screen.findByText("Jogo 17")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Horário estimado do jogo" }),
    ).toHaveTextContent("10:40");

    fireEvent.click(screen.getByRole("combobox", { name: "Horário estimado do jogo" }));
    fireEvent.click(await screen.findByText("09:20"));

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(updateScheduledMatchLogisticsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          match_id: "edit-game-slot-match",
          scheduled_date: "2026-04-11",
          location: "Praia de Piçarras",
          court_name: "Quadra 1",
          slot_start_time: "2026-04-11T09:20:00.000Z",
          representation_mode: MatchManualRepresentationMode.AUTO,
        }),
      );
    });

    await waitFor(() => {
      expect(updateBracketDayScheduleMock).toHaveBeenCalledWith("edition-1", [
        {
          date: "2026-04-11",
          start_time: "08:00",
          end_time: "18:00",
          breaks: [],
        },
      ]);
    });

    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("permite forçar representação da CO sem redistribuir a fila do jogo agendado", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 2),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "edit-co-override-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra 1",
          start_time: "2026-04-11T08:40:00.000Z",
          queue_position: 2,
          scheduled_slot: 2,
          home_team: buildTeam({ id: "edit-co-home", name: "CASA CO" }),
          away_team: buildTeam({ id: "edit-co-away", name: "VISITANTE CO" }),
        }),
      ],
    });

    fireEvent.pointerDown(await screen.findByLabelText("Ações do jogo CASA CO x VISITANTE CO"));
    const matchCardContainer = getMatchCardContainerByTeamName("CASA CO");
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    expect(await screen.findByText("Jogo 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Forçar representação da CO" }));

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(updateScheduledMatchLogisticsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          match_id: "edit-co-override-match",
          slot_start_time: "2026-04-11T08:40:00.000Z",
          representation_mode: MatchManualRepresentationMode.CO,
        }),
      );
    });

    expect(updateBracketDayScheduleMock).not.toHaveBeenCalled();
    expect(supabaseUpdateCalls).toHaveLength(0);
  });

  it("permite forçar a CO sem reaplicar o horário de uma realocação manual", async () => {
    listEditableMatchScheduleSlotsMock.mockResolvedValue({
      data: buildEditableScheduleSlots("2026-04-11", 1),
      error: null,
    });

    renderAdminMatches({
      matches: [
        buildMatch({
          id: "manual-relocation-co-match",
          sport_id: "sport-1",
          status: MatchStatus.SCHEDULED,
          court_name: "Quadra 1",
          start_time: "2026-04-11T19:17:00+00:00",
          queue_position: 24,
          scheduled_slot: 24,
          is_manual_schedule_override: true,
          home_team: buildTeam({ id: "manual-co-home", name: "CASA MANUAL CO" }),
          away_team: buildTeam({
            id: "manual-co-away",
            name: "VISITANTE MANUAL CO",
          }),
        }),
      ],
      estimatedStartTimeByMatchId: {
        "manual-relocation-co-match": "19:17",
      },
    });

    fireEvent.pointerDown(
      await screen.findByLabelText(
        "Ações do jogo CASA MANUAL CO x VISITANTE MANUAL CO",
      ),
    );
    const matchCardContainer = getMatchCardContainerByTeamName(
      "CASA MANUAL CO",
    );
    clickFirstMenuItemInMatchCard(matchCardContainer, "Editar");

    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Forçar representação da CO",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(supabaseUpdateCalls).toContainEqual({
        table: "matches",
        payload: {
          manual_representation_mode: MatchManualRepresentationMode.CO,
        },
        method: "eq",
        ids: ["manual-relocation-co-match"],
      });
    });

    expect(updateScheduledMatchLogisticsMock).not.toHaveBeenCalled();
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
