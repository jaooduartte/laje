import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminChampionshipBracketPage } from "@/components/admin/AdminChampionshipBracketPage";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import { resolveExactPreviewCacheFromJob } from "@/domain/championship-brackets/championshipBracketExactPreview";
import { resolveChampionshipBracketExactPreviewPayloadSignature } from "@/domain/championship-brackets/championshipBracketStructuralReview";
import { sanitizeChampionshipBracketWizardDraft } from "@/domain/championship-brackets/championshipBracketWizardSync";
import type {
  ChampionshipBracketPreviewJob,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  BracketThirdPlaceMode,
  ChampionshipCode,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipStatus,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { Championship, ChampionshipSport, Team } from "@/lib/types";

const fetchChampionshipBracketLocationTemplatesMock = vi.fn();
const fetchChampionshipBracketWizardDraftMock = vi.fn();
const saveChampionshipBracketWizardDraftMock = vi.fn();
const startChampionshipBracketPreviewJobMock = vi.fn();
const fetchChampionshipBracketPreviewJobStatusMock = vi.fn();
const fetchChampionshipBracketPreviewJobDayMock = vi.fn();
const cancelChampionshipBracketPreviewJobMock = vi.fn();
const createChampionshipBracketFromPreviewJobMock = vi.fn();
const { toastInfoMock } = vi.hoisted(() => ({
  toastInfoMock: vi.fn(),
}));

vi.mock("@/components/admin/AdminBracketDrawModal", () => ({
  AdminBracketDrawModal: () => null,
}));

vi.mock("@/components/ui/date-time-picker", () => ({
  DateTimePicker: () => null,
}));

vi.mock("@/hooks/useChampionshipSeasonSettings", () => ({
  useChampionshipSeasonSettings: () => ({
    seasonSettings: null,
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/domain/championship-brackets/championshipBracketDraft.repository", () => ({
  clearChampionshipBracketWizardDraft: vi.fn().mockResolvedValue(undefined),
  fetchChampionshipBracketWizardDraft: (...args: unknown[]) =>
    fetchChampionshipBracketWizardDraftMock(...args),
  saveChampionshipBracketWizardDraft: (...args: unknown[]) =>
    saveChampionshipBracketWizardDraftMock(...args),
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  cancelChampionshipBracketPreviewJob: (...args: unknown[]) =>
    cancelChampionshipBracketPreviewJobMock(...args),
  createChampionshipBracketFromPreviewJob: (...args: unknown[]) =>
    createChampionshipBracketFromPreviewJobMock(...args),
  deleteChampionshipBracketLocationTemplate: vi.fn(),
  fetchChampionshipBracketPreviewJobDay: (...args: unknown[]) =>
    fetchChampionshipBracketPreviewJobDayMock(...args),
  fetchChampionshipBracketPreviewJobStatus: (...args: unknown[]) =>
    fetchChampionshipBracketPreviewJobStatusMock(...args),
  fetchChampionshipBracketLocationTemplates: (...args: unknown[]) =>
    fetchChampionshipBracketLocationTemplatesMock(...args),
  saveChampionshipBracketLocationTemplate: vi.fn(),
  startChampionshipBracketPreviewJob: (...args: unknown[]) =>
    startChampionshipBracketPreviewJobMock(...args),
}));

vi.mock("@/domain/championship-seasons/championshipSeason.repository", () => ({
  saveChampionshipSeasonSettings: vi.fn(),
}));

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  syncChampionshipIndividualEventsFromSetup: vi.fn(),
  syncChampionshipIndividualSessionsFromSetup: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: toastInfoMock,
  },
}));

function buildSelectedChampionship(): Championship {
  return {
    id: "championship-1",
    code: ChampionshipCode.INTERLAJE,
    name: "Interlaje 2026",
    status: ChampionshipStatus.PLANNING,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function buildTeams(): Team[] {
  return [
    {
      id: "team-1",
      name: "Atlética A",
      city: "Joinville",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      created_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "team-2",
      name: "Atlética B",
      city: "Joinville",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ];
}

function buildChampionshipSports(): ChampionshipSport[] {
  return [
    {
      id: "championship-sport-1",
      championship_id: "championship-1",
      sport_id: "sport-1",
      naipe_mode: "MASCULINO_FEMININO",
      result_rule: "POINTS",
      supports_cards: false,
      tie_breaker_rule: "BEACH_SOCCER",
      default_match_duration_minutes: 40,
      show_estimated_start_time_on_cards: false,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      created_at: "2026-08-01T00:00:00.000Z",
      walkover_winner_points: 3,
      awards_include_knockout_phase: true,
      supports_individual_awards: true,
      sports: {
        id: "sport-1",
        name: "Futsal",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    } as ChampionshipSport,
  ];
}

function buildDraft(
  overrides: Partial<ChampionshipBracketWizardDraftFormValues> = {},
): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: 12,
    season_settings: {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
      principal_slots_count: null,
      principal_relegation_count: 2,
      access_promotion_count: 2,
    },
    selected_team_ids: ["team-1", "team-2"],
    enabled_sport_ids: ["sport-1"],
    selected_sport_ids_by_team_id: {
      "team-1": ["sport-1"],
      "team-2": ["sport-1"],
    },
    show_estimated_start_time_on_cards_by_sport_id: {},
    selected_competition_keys_by_team_id: {
      "team-1": ["sport-1::MASCULINO::DIVISAO_PRINCIPAL"],
      "team-2": ["sport-1::MASCULINO::DIVISAO_PRINCIPAL"],
    },
    should_apply_modalities_to_all_teams: true,
    should_apply_naipes_to_all_teams: true,
    should_replicate_previous_schedule_day: false,
    competition_config_by_key: {
      "sport-1::MASCULINO::DIVISAO_PRINCIPAL": {
        groups_count: 1,
        qualifiers_per_group: 1,
        should_complete_knockout_with_best_second_placed_teams: false,
        knockout_pairing_mode: "LINEAR",
      },
    },
    group_assignments_by_competition_key: {
      "sport-1::MASCULINO::DIVISAO_PRINCIPAL": {
        "team-1": 1,
        "team-2": 1,
      },
    },
    group_order_by_competition_key: {
      "sport-1::MASCULINO::DIVISAO_PRINCIPAL": {
        1: ["team-1", "team-2"],
      },
    },
    schedule_days: [
      {
        id: "day-1",
        date: "2026-08-29",
        start_time: "08:00",
        end_time: "18:00",
        break_start_time: "12:00",
        break_end_time: "13:00",
        locations: [
          {
            id: "loc-1",
            location_template_id: null,
            name: "Campus Park",
            position: 1,
            courts: [
              {
                id: "court-1",
                name: "Quadra Interna",
                position: 1,
                sport_ids: ["sport-1"],
                sport_preference: null,
                sport_match_targets: [
                  {
                    sport_id: "sport-1",
                    planned_match_count: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    competition_date_availability: [
      {
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-29",
        mode: "FULL_DAY",
        windows: [],
      },
    ],
    team_competition_date_availability: [
      {
        team_id: "team-1",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-29",
        mode: "FULL_DAY",
        windows: [],
      },
      {
        team_id: "team-2",
        competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
        date: "2026-08-29",
        mode: "FULL_DAY",
        windows: [],
      },
    ],
    individual_event_configs: [],
    individual_session_configs: [],
    resource_locks: [],
    match_numbering_mode: "COURT",
    knockout_program_blocks: [],
    exact_preview_cache: null,
    ...overrides,
  };
}

function buildSetupPayloadFromDraft(draft: ChampionshipBracketWizardDraftFormValues) {
  const sanitizedDraft = sanitizeChampionshipBracketWizardDraft({
    draftFormValues: draft,
    teams: buildTeams(),
    championshipSports: buildChampionshipSports(),
    seasonSettings: draft.season_settings,
  });

  return ChampionshipBracketSetupDTO.fromFormValues({
    season_settings: sanitizedDraft.season_settings,
    enabled_sport_ids: sanitizedDraft.enabled_sport_ids,
    participants: [
      {
        team_id: "team-1",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
      {
        team_id: "team-2",
        modalities: [
          {
            sport_id: "sport-1",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
          },
        ],
      },
    ],
    competitions: [
      {
        sport_id: "sport-1",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        groups_count: 1,
        qualifiers_per_group: 1,
        should_complete_knockout_with_best_second_placed_teams: false,
        knockout_pairing_mode: "LINEAR",
        third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
        groups: [
          {
            group_number: 1,
            team_ids: ["team-1", "team-2"],
          },
        ],
      },
    ],
    schedule_days: [
      {
        date: "2026-08-29",
        start_time: "08:00",
        end_time: "18:00",
        break_start_time: "12:00",
        break_end_time: "13:00",
        locations: [
          {
            location_key: "loc-1",
            name: "Campus Park",
            position: 1,
            courts: [
              {
                court_key: "court-1",
                name: "Quadra Interna",
                position: 1,
                sport_ids: ["sport-1"],
                sport_match_targets: [
                  {
                    sport_id: "sport-1",
                    planned_match_count: 3,
                  },
                ],
                sport_preference: null,
              },
            ],
          },
        ],
      },
    ],
    competition_date_availability:
      sanitizedDraft.competition_date_availability ?? [],
    team_competition_date_availability:
      sanitizedDraft.team_competition_date_availability ?? [],
    individual_event_configs: [],
    individual_session_configs: [],
    resource_locks: [],
    match_numbering_mode: "COURT",
    knockout_program_blocks: [],
  }).bindToSave();
}

function buildExactPreviewResult(): ChampionshipBracketPreviewResult {
  return {
    ok: true,
    message: null,
    server_payload_signature: "server-payload-signature",
    generation_signature: "generation-signature",
    match_numbering_mode: "COURT",
    summary: {
      total_matches: 3,
      group_stage_matches: 1,
      knockout_matches: 2,
      scheduled_matches: 3,
      occupied_minutes: 120,
      available_minutes: 540,
      utilization_percentage: 22,
      free_windows: 1,
      conflict_count: 0,
      warning_count: 0,
      games_by_day: [
        {
          date: "2026-08-29",
          matches: 3,
        },
      ],
    },
    days: [
      {
        date: "2026-08-29",
        start_time: "08:00",
        end_time: "18:00",
        occupied_minutes: 120,
        available_minutes: 540,
        utilization_percentage: 22,
        free_windows: 1,
        breaks: [],
        locations: [
          {
            location_key: "loc-1",
            location_name: "Campus Park",
            courts: [
              {
                court_key: "court-1",
                court_name: "Quadra Interna",
                occupied_minutes: 120,
                available_minutes: 540,
                utilization_percentage: 22,
                free_windows: 1,
                entries: [
                  {
                    type: "RESERVATION",
                    start_time: "07:30",
                    end_time: "08:00",
                    duration_minutes: 30,
                    match_kind: null,
                    match_number: null,
                    sport_id: null,
                    sport_name: null,
                    naipe: null,
                    division: null,
                    phase: null,
                    phase_label: null,
                    group_number: null,
                    round_number: null,
                    reason_code: "HARD",
                    reason: "Reserva fixa",
                    projected: false,
                    manual_final: false,
                  },
                  {
                    type: "MATCH",
                    start_time: "08:00",
                    end_time: "08:40",
                    duration_minutes: 40,
                    match_kind: "GROUP_STAGE",
                    match_number: 1,
                    sport_id: "sport-1",
                    sport_name: "Futsal",
                    naipe: MatchNaipe.MASCULINO,
                    division: TeamDivision.DIVISAO_PRINCIPAL,
                    phase: "GROUP_STAGE",
                    phase_label: "Grupos",
                    group_number: 1,
                    round_number: null,
                    home_team_id: "team-1",
                    home_team_name: "Atlética A",
                    away_team_id: "team-2",
                    away_team_name: "Atlética B",
                    reason_code: null,
                    reason: null,
                    projected: false,
                    manual_final: false,
                  },
                  {
                    type: "EMPTY",
                    start_time: "08:40",
                    end_time: "12:00",
                    duration_minutes: 200,
                    match_kind: null,
                    match_number: null,
                    sport_id: null,
                    sport_name: null,
                    naipe: null,
                    division: null,
                    phase: null,
                    phase_label: null,
                    group_number: null,
                    round_number: null,
                    reason_code: "FREE_WINDOW",
                    reason: null,
                    projected: false,
                    manual_final: false,
                  },
                  {
                    type: "BREAK",
                    start_time: "12:00",
                    end_time: "13:00",
                    duration_minutes: 60,
                    match_kind: null,
                    match_number: null,
                    sport_id: null,
                    sport_name: null,
                    naipe: null,
                    division: null,
                    phase: null,
                    phase_label: null,
                    group_number: null,
                    round_number: null,
                    reason_code: "SCHEDULE_BREAK",
                    reason: "Intervalo da programação",
                    projected: false,
                    manual_final: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function buildExactPreviewJob(
  overrides: Partial<ChampionshipBracketPreviewJob> = {},
): ChampionshipBracketPreviewJob {
  const preview = buildExactPreviewResult();

  return {
    job_id: "preview-job-1",
    championship_id: "championship-1",
    season_year: 2026,
    status: "COMPLETED",
    stage: "Concluído",
    current_date: null,
    progress_percentage: 100,
    processed_slots: 12,
    total_slots: 12,
    attempt_count: 0,
    error_message: null,
    summary: preview.summary,
    diagnostics: preview.diagnostics,
    payload_signature: "server-payload-signature",
    dependency_signature: "dependency-signature",
    algorithm_version: "async-exact-v8",
    generation_signature: "generation-signature",
    created_at: "2026-08-12T02:00:00.000Z",
    started_at: "2026-08-12T02:00:30.000Z",
    completed_at: "2026-08-12T02:01:00.000Z",
    expires_at: "2099-08-19T02:01:00.000Z",
    is_valid_for_creation: true,
    events: [],
    ...overrides,
  };
}

function buildStoredExactPreviewCache(
  payloadSignature: string,
  result: ChampionshipBracketPreviewResult | null = null,
) {
  const job = buildExactPreviewJob();

  return {
    job_id: job.job_id,
    payload_signature: payloadSignature,
    server_payload_signature: job.payload_signature,
    generation_signature: job.generation_signature ?? "",
    dependency_signature: job.dependency_signature,
    algorithm_version: job.algorithm_version,
    status: job.status,
    stage: job.stage,
    current_date: job.current_date,
    progress_percentage: job.progress_percentage,
    processed_slots: job.processed_slots,
    total_slots: job.total_slots,
    expires_at: job.expires_at,
    is_valid_for_creation: job.is_valid_for_creation,
    generated_at: job.completed_at ?? job.created_at,
    result,
  };
}

function renderPage() {
  return render(
    <AdminChampionshipBracketPage
      selectedChampionship={buildSelectedChampionship()}
      teams={buildTeams()}
      championshipSports={buildChampionshipSports()}
      onGenerated={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe("AdminChampionshipBracketPage - Etapa 13", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    fetchChampionshipBracketLocationTemplatesMock.mockResolvedValue({
      data: [],
      error: null,
    });
    saveChampionshipBracketWizardDraftMock.mockResolvedValue({
      error: null,
      metadata: null,
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: buildExactPreviewJob(),
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: buildExactPreviewJob(),
      error: null,
    });
    fetchChampionshipBracketPreviewJobDayMock.mockResolvedValue({
      data: buildExactPreviewResult().days[0],
      error: null,
    });
    cancelChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: buildExactPreviewJob({ status: "CANCELLED" }),
      error: null,
    });
    createChampionshipBracketFromPreviewJobMock.mockResolvedValue({
      data: "bracket-edition-1",
      error: null,
    });
  });

  it("entra na etapa sem chamar a prévia exata e sem exibir o resumo de configurações", async () => {
    const draft = buildDraft();

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    expect(await screen.findByText("Revisão Final")).toBeInTheDocument();
    expect(
      screen.queryByText("Jogos coletivos previstos"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sessões das modalidades individuais"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Jogos planejados nas metas"),
    ).not.toBeInTheDocument();
    expect(startChampionshipBracketPreviewJobMock).not.toHaveBeenCalled();
  });

  it("bloqueia a criação até a prévia exata manual atual ser concluída", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });

    renderPage();

    const createButton = await screen.findByRole("button", {
      name: "Criar campeonato",
    });
    expect(createButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Calcular programação exata" }),
    );

    await waitFor(() => expect(createButton).toBeEnabled());
    expect(createChampionshipBracketFromPreviewJobMock).not.toHaveBeenCalled();
  });

  it("persiste somente as assinaturas após calcular a prévia exata", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    await waitFor(() =>
      expect(saveChampionshipBracketWizardDraftMock).toHaveBeenCalled(),
    );

    expect(saveChampionshipBracketWizardDraftMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        exact_preview_cache: expect.objectContaining({
          server_payload_signature: "server-payload-signature",
          generation_signature: "generation-signature",
          is_valid_for_creation: true,
          result: null,
        }),
      }),
    );
  });

  it("mantém o histórico e a duração do job concluído visíveis", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    const completedJob = buildExactPreviewJob({
      events: [
        {
          event_type: "STAGE_CHANGED",
          stage: "SCHEDULING_GROUPS",
          status: "SCHEDULING",
          occurred_at: "2026-08-12T02:00:30.000Z",
          details: {},
        },
        {
          event_type: "PENDING_MATCH_COUNT_DECREASED",
          stage: "COMPACTING_GROUPS",
          status: "SCHEDULING",
          occurred_at: "2026-08-12T02:00:45.000Z",
          details: {
            pending_matches_before: 4,
            pending_matches_after: 3,
          },
        },
        {
          event_type: "GROUP_MATCH_SCHEDULED",
          stage: "SCHEDULING_GROUPS",
          status: "SCHEDULING",
          occurred_at: "2026-08-12T02:00:50.000Z",
          details: {
            logical_key: "initial-group-match",
            sport_name: "Tênis",
            phase: "GROUP_STAGE",
          },
        },
        {
          event_type: "STAGE_CHANGED",
          stage: "Falha após cinco tentativas",
          status: "FAILED",
          occurred_at: "2026-08-12T02:01:00.000Z",
          details: {},
        },
      ],
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: completedJob,
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: completedJob,
      error: null,
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    expect(await screen.findByText(/Duração total: 30 s/)).toBeInTheDocument();
    expect(
      screen.getByText("Histórico do job (3 registro(s))"),
    ).toBeInTheDocument();
    expect(screen.getByText("Programando fase de grupos")).toBeInTheDocument();
    expect(screen.getByText("Pendências reduzidas: 4 → 3")).toBeInTheDocument();
    expect(screen.getByText("Falha após cinco tentativas")).toBeInTheDocument();
    expect(screen.queryByText(/Jogo encaixado: Tênis/)).not.toBeInTheDocument();
  });

  it("bloqueia o cancelamento enquanto a solicitação está em andamento", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    const runningJob = buildExactPreviewJob({
      status: "SCHEDULING",
      stage: "SCHEDULING_GROUPS",
      completed_at: null,
      is_valid_for_creation: false,
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: runningJob,
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: runningJob,
      error: null,
    });
    let resolveCancellation: (value: {
      data: ChampionshipBracketPreviewJob | null;
      error: Error | null;
    }) => void;
    cancelChampionshipBracketPreviewJobMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve;
        }),
    );

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    const cancelButton = await screen.findByRole("button", {
      name: "Cancelar cálculo",
    });
    fireEvent.click(cancelButton);

    expect(cancelButton).toBeDisabled();
    expect(screen.getByText("Cancelando cálculo...")).toBeInTheDocument();

    await act(async () => {
      resolveCancellation({
        data: buildExactPreviewJob({
          status: "CANCELLED",
          stage: "Cancelado",
          completed_at: "2026-08-12T02:01:00.000Z",
          is_valid_for_creation: false,
        }),
        error: null,
      });
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Cancelar cálculo" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("aguarda a conclusão da prévia para exibir pendências impeditivas", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    const runningJob = buildExactPreviewJob({
      status: "SCHEDULING",
      stage: "SCHEDULING_GROUPS",
      progress_percentage: 66,
      processed_slots: 430,
      completed_at: null,
      is_valid_for_creation: false,
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: runningJob,
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: runningJob,
      error: null,
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    expect(
      await screen.findByText("Prévia exata em processamento"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Programando fase de grupos"),
    ).toBeInTheDocument();
    expect(screen.queryByText("SCHEDULING_GROUPS")).not.toBeInTheDocument();
    expect(screen.getByText(/Iniciado em/)).toBeInTheDocument();
    expect(screen.getByText(/Em andamento há/)).toBeInTheDocument();
    expect(
      screen.queryByText("Prévia exata com pendências impeditivas"),
    ).not.toBeInTheDocument();
  });

  it("traduz o estágio técnico de fila da prévia exata", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    const queuedJob = buildExactPreviewJob({
      status: "QUEUED",
      stage: "QUEUED",
      progress_percentage: 0,
      processed_slots: 0,
      completed_at: null,
      is_valid_for_creation: false,
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: queuedJob,
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: queuedJob,
      error: null,
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    expect(await screen.findByText("Na fila")).toBeInTheDocument();
    expect(screen.queryByText("QUEUED")).not.toBeInTheDocument();
  });

  it("exibe os jogos não alocados quando o job falha sem resumo", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: buildExactPreviewJob({
        status: "SCHEDULING",
        stage: "Distribuindo jogos por dia",
        progress_percentage: 80,
        summary: null,
        diagnostics: [],
        generation_signature: null,
        completed_at: null,
        is_valid_for_creation: false,
      }),
      error: null,
    });
    fetchChampionshipBracketPreviewJobStatusMock.mockResolvedValue({
      data: buildExactPreviewJob({
        status: "FAILED",
        stage: "Falha",
        progress_percentage: 100,
        error_message:
          "Não foi possível encaixar 1 jogo na grade configurada.",
        summary: null,
        diagnostics: [
          {
            code: "UNASSIGNED_MATCH",
            severity: "ERROR",
            message:
              "Atlética A × Atlética B — Grupo 1, rodada 3: todos os horários físicos compatíveis com a meta já estavam ocupados.",
            reason_code: "COURT_CAPACITY_EXHAUSTED",
            match_id: "match-1",
            date: null,
            location_name: null,
            court_name: null,
            sport_id: "sport-1",
            sport_name: "Futsal",
            naipe: MatchNaipe.MASCULINO,
            division: TeamDivision.DIVISAO_PRINCIPAL,
            phase: "GROUP_STAGE",
            group_number: 1,
            round_number: 3,
            home_team_id: "team-1",
            home_team_name: "Atlética A",
            away_team_id: "team-2",
            away_team_name: "Atlética B",
          },
        ],
        generation_signature: null,
        completed_at: "2026-08-12T02:01:00.000Z",
        is_valid_for_creation: false,
      }),
      error: null,
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    expect(
      await screen.findByText("Falha ao calcular a prévia exata"),
    ).toBeInTheDocument();
    expect(screen.getByText("Atlética A × Atlética B")).toBeInTheDocument();
    expect(screen.getByText(/Grupo 1/)).toBeInTheDocument();
    expect(screen.getByText(/Rodada 3/)).toBeInTheDocument();
    expect(
      screen.getByText(/todos os horários físicos compatíveis/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Jogos totais")).not.toBeInTheDocument();
  });

  it("retoma o job por polling e carrega a cronologia somente ao expandir o dia", async () => {
    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: buildDraft(),
      metadata: null,
      source: "local",
    });
    startChampionshipBracketPreviewJobMock.mockResolvedValue({
      data: buildExactPreviewJob({
        status: "SCHEDULING",
        stage: "Distribuindo jogos por dia",
        progress_percentage: 35,
        processed_slots: 7,
        generation_signature: null,
        completed_at: null,
        is_valid_for_creation: false,
      }),
      error: null,
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Calcular programação exata",
      }),
    );

    expect(
      await screen.findByText("Prévia exata validada"),
    ).toBeInTheDocument();
    expect(fetchChampionshipBracketPreviewJobStatusMock).toHaveBeenCalledWith(
      "preview-job-1",
    );
    expect(fetchChampionshipBracketPreviewJobDayMock).not.toHaveBeenCalled();

    const collapsedExactPreviewDayButton = screen.getByRole("button", {
      name: "Expandir programação de 29/08/2026",
    });
    const collapsedExactPreviewDayCard =
      collapsedExactPreviewDayButton.closest("section");

    expect(collapsedExactPreviewDayCard).not.toBeNull();

    const collapsedExactPreviewDay = within(collapsedExactPreviewDayCard!);

    expect(
      collapsedExactPreviewDay.getByText("08:00 até 18:00"),
    ).toBeInTheDocument();
    expect(
      collapsedExactPreviewDay.getByText("1 local(is)"),
    ).toBeInTheDocument();
    expect(
      collapsedExactPreviewDay.getByText("1 quadra(s)"),
    ).toBeInTheDocument();

    fireEvent.click(
      collapsedExactPreviewDayButton,
    );

    await waitFor(() =>
      expect(fetchChampionshipBracketPreviewJobDayMock).toHaveBeenCalledWith(
        "preview-job-1",
        "2026-08-29",
      ),
    );
    const exactPreviewDayButton = await screen.findByRole("button", {
      name: "Recolher programação de 29/08/2026",
    });
    const exactPreviewDayCard = exactPreviewDayButton.closest("section");

    expect(exactPreviewDayCard).not.toBeNull();

    const exactPreviewDay = within(exactPreviewDayCard!);

    expect(exactPreviewDay.getByText("1 local(is)")).toBeInTheDocument();
    expect(exactPreviewDay.getAllByText("1 quadra(s)")).toHaveLength(2);
    expect(exactPreviewDay.getByText("Quadra Interna")).toBeInTheDocument();
    expect(
      exactPreviewDay.getByText("Sequência cronológica da quadra"),
    ).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Programação exata")).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Jogo 1")).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Masculino")).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Fase de grupos")).toBeInTheDocument();
    expect(exactPreviewDay.queryByText("Grupo A")).not.toBeInTheDocument();
    expect(
      exactPreviewDay.getByText("Atlética A × Atlética B"),
    ).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Futsal")).toBeInTheDocument();
    expect(exactPreviewDay.getByText("Reserva fixa")).toBeInTheDocument();
    expect(exactPreviewDay.getAllByText("Janela livre")).toHaveLength(1);
    expect(exactPreviewDay.getAllByText("Intervalo")).toHaveLength(1);
    expect(screen.queryByText("Jogos totais")).not.toBeInTheDocument();
  });

  it("mantém todos os schedule_days da prévia exata, inclusive o dia sem jogos de grupos", () => {
    const setupPayload = buildSetupPayloadFromDraft(buildDraft());
    const scheduleDays = [
      ...setupPayload.schedule_days,
      {
        date: "2026-09-19",
        start_time: "09:00",
        end_time: "12:00",
        break_start_time: null,
        break_end_time: null,
        locations: [],
      },
    ];

    const cache = resolveExactPreviewCacheFromJob({
      job: buildExactPreviewJob(),
      localPayloadSignature: "payload-signature",
      matchNumberingMode: "COURT",
      previousResult: buildExactPreviewResult(),
      scheduleDays,
    });

    expect(cache.result?.days.map((day) => day.date)).toEqual([
      "2026-08-29",
      "2026-09-19",
    ]);
    expect(cache.result?.days[1]).toMatchObject({
      start_time: "09:00",
      end_time: "12:00",
      locations: [],
    });
  });

  it("mantém os dias da revisão estrutural recolhidos até o admin expandir", async () => {
    const draft = buildDraft();

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    const { container } = renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir prévia de 29/08/2026",
    });

    expect(screen.queryByText("Sequência cronológica da quadra")).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByText("Sequência cronológica da quadra"),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(".structural-review-timeline-entry"),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("button", {
        name: "Recolher prévia de 29/08/2026",
      }),
    ).toBeInTheDocument();
  });

  it("oferece a numeração por modalidade na etapa 11", async () => {
    const draft = buildDraft({
      current_step_index: 10,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    expect(await screen.findByText("Numeração dos jogos")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /incluindo todos os naipes/i }),
    ).toBeInTheDocument();
  });

  it("mantém os cards de dia da etapa 11 recolhidos até o admin expandir", async () => {
    const draft = buildDraft({
      current_step_index: 10,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir programação de Dia 1",
    });

    expect(
      screen.getByText(/Tudo certo neste dia|pendência.*para revisar/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Futsal: 3 jogos")).toBeInTheDocument();
    expect(
      screen.queryByText("Jogos planejados por modalidade"),
    ).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByText("Jogos planejados por modalidade"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Recolher programação de Dia 1",
      }),
    ).toBeInTheDocument();
  });

  it("recolhe os dias da agenda até o admin expandir", async () => {
    const draft = buildDraft({
      current_step_index: 6,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir Dia 1",
    });

    expect(
      screen.getByRole("button", { name: "Adicionar dia" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Locais do dia")).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(await screen.findByText("Locais do dia")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recolher Dia 1" }),
    ).toBeInTheDocument();
  });

  it("recolhe as modalidades na etapa 5 até o admin expandir", async () => {
    const draft = buildDraft({
      current_step_index: 4,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir Futsal",
    });

    expect(
      screen.queryByTestId("naipe-card-sport-1-tab-MASCULINO"),
    ).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByTestId("naipe-card-sport-1-tab-MASCULINO"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recolher Futsal" }),
    ).toBeInTheDocument();
  });

  it("recolhe as modalidades e suas atléticas na etapa 4", async () => {
    const draft = buildDraft({
      current_step_index: 3,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir Futsal",
    });

    expect(
      screen.queryByTestId("modality-card-sport-1-team-team-1"),
    ).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByTestId("modality-card-sport-1-team-team-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recolher Futsal" }),
    ).toBeInTheDocument();
  });

  it("recolhe as atléticas e suas modalidades na etapa 10", async () => {
    const draft = buildDraft({
      current_step_index: 9,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandTeamButton = await screen.findByRole("button", {
      name: "Expandir modalidades de Atlética A",
    });

    expect(
      screen.queryByRole("button", {
        name: "Expandir disponibilidade de Futsal da Atlética A",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(expandTeamButton);

    const expandSportButton = await screen.findByRole("button", {
      name: "Expandir disponibilidade de Futsal da Atlética A",
    });

    expect(
      screen.queryByRole("button", { name: "Disponível em todos" }),
    ).not.toBeInTheDocument();

    fireEvent.click(expandSportButton);

    expect(
      await screen.findByRole("button", { name: "Disponível em todos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Recolher disponibilidade de Futsal da Atlética A",
      }),
    ).toBeInTheDocument();
  });

  it("recolhe as combinações de modalidade e naipe na etapa 9", async () => {
    const draft = buildDraft({
      current_step_index: 8,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: /Expandir disponibilidade de Futsal.*Masculino/i,
    });

    expect(
      screen.queryByRole("button", { name: "Todos os dias" }),
    ).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByRole("button", { name: "Todos os dias" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Recolher disponibilidade de Futsal.*Masculino/i,
      }),
    ).toBeInTheDocument();
  });

  it("mantém os grupos da etapa 12 recolhidos até o admin expandir", async () => {
    const draft = buildDraft({
      current_step_index: 11,
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    renderPage();

    const expandButton = await screen.findByRole("button", {
      name: "Expandir grupos de Futsal Masculino",
    });

    expect(
      screen.queryByTestId(
        "sport-1::MASCULINO::DIVISAO_PRINCIPAL-group-1-column",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(expandButton);

    expect(
      await screen.findByTestId(
        "sport-1::MASCULINO::DIVISAO_PRINCIPAL-group-1-column",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Recolher grupos de Futsal Masculino",
      }),
    ).toBeInTheDocument();
  });

  it("limpa metas ocultas de rascunho legado e informa o ajuste", async () => {
    const draft = buildDraft({
      competition_date_availability: [
        {
          competition_key: "sport-1::MASCULINO::DIVISAO_PRINCIPAL",
          date: "2026-08-29",
          mode: "UNAVAILABLE",
          windows: [],
        },
      ],
    });

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "remote",
    });

    renderPage();

    await screen.findByText("Revisão Final");

    expect(toastInfoMock).toHaveBeenCalledWith(
      expect.stringContaining("1 meta de jogos"),
    );
  });

  it("dispara a prévia exata manual apenas uma vez por carregamento", async () => {
    const draft = buildDraft();

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: draft,
      metadata: null,
      source: "local",
    });

    let resolvePreview: ((value: unknown) => void) | null = null;
    startChampionshipBracketPreviewJobMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );

    renderPage();

    const actionButton = await screen.findByRole("button", {
      name: "Calcular programação exata",
    });

    fireEvent.click(actionButton);
    fireEvent.click(actionButton);
    await waitFor(() =>
      expect(startChampionshipBracketPreviewJobMock).toHaveBeenCalledTimes(1),
    );

    expect(screen.getByRole("button", { name: /Calculando/i })).toBeDisabled();

    await act(async () => {
      resolvePreview?.({
        data: buildExactPreviewJob(),
        error: null,
      });
    });
  });

  it("aceita as assinaturas válidas restauradas do draft sem restaurar a cronologia", async () => {
    const draft = buildDraft();
    const payloadSignature = resolveChampionshipBracketExactPreviewPayloadSignature(
      buildSetupPayloadFromDraft(draft),
    );

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: {
        ...draft,
        exact_preview_cache: buildStoredExactPreviewCache(payloadSignature),
      },
      metadata: null,
      source: "remote",
    });

    renderPage();

    expect(await screen.findByText("Prévia exata validada")).toBeInTheDocument();
    expect(screen.getByText(/Prévia válida gerada em/i)).toBeInTheDocument();
    expect(screen.queryByText("Jogos totais")).not.toBeInTheDocument();
  });

  it("marca o cache como desatualizado quando a assinatura mudou", async () => {
    const draft = buildDraft();

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: {
        ...draft,
        exact_preview_cache: buildStoredExactPreviewCache(
          "stale-signature",
          buildExactPreviewResult(),
        ),
      },
      metadata: null,
      source: "remote",
    });

    renderPage();

    expect(
      await screen.findByText("Última simulação exata desatualizada"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Prévia exata desatualizada"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Fonte: job durável/i)).not.toBeInTheDocument();
  });

  it("invalida uma prévia concluída pela versão antiga do algoritmo", async () => {
    const draft = buildDraft();
    const payloadSignature = resolveChampionshipBracketExactPreviewPayloadSignature(
      buildSetupPayloadFromDraft(draft),
    );

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: {
        ...draft,
        exact_preview_cache: {
          ...buildStoredExactPreviewCache(payloadSignature),
          algorithm_version: "async-exact-v3",
        },
      },
      metadata: null,
      source: "remote",
    });

    renderPage();

    expect(
      await screen.findByText("Última simulação exata desatualizada"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Prévia exata validada")).not.toBeInTheDocument();
  });
});
