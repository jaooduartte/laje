import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminChampionshipBracketPage } from "@/components/admin/AdminChampionshipBracketPage";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import { resolveChampionshipBracketExactPreviewPayloadSignature } from "@/domain/championship-brackets/championshipBracketStructuralReview";
import { sanitizeChampionshipBracketWizardDraft } from "@/domain/championship-brackets/championshipBracketWizardSync";
import type {
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
const previewChampionshipBracketGroupsMock = vi.fn();
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
  deleteChampionshipBracketLocationTemplate: vi.fn(),
  generateChampionshipBracketGroups: vi.fn(),
  fetchChampionshipBracketLocationTemplates: (...args: unknown[]) =>
    fetchChampionshipBracketLocationTemplatesMock(...args),
  previewChampionshipBracketGroups: (...args: unknown[]) =>
    previewChampionshipBracketGroupsMock(...args),
  saveChampionshipBracketLocationTemplate: vi.fn(),
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
        breaks: [
          {
            start_time: "12:00",
            end_time: "13:00",
          },
        ],
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
                    phase_label: "Fase de grupos",
                    group_number: 1,
                    round_number: null,
                    reason_code: null,
                    reason: null,
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
    previewChampionshipBracketGroupsMock.mockResolvedValue({
      data: buildExactPreviewResult(),
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
    expect(previewChampionshipBracketGroupsMock).not.toHaveBeenCalled();
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
    previewChampionshipBracketGroupsMock.mockImplementation(
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
    await waitFor(() =>
      expect(previewChampionshipBracketGroupsMock).toHaveBeenCalledTimes(1),
    );

    expect(screen.getByRole("button", { name: /Calculando/i })).toBeDisabled();

    await act(async () => {
      resolvePreview?.({
        data: buildExactPreviewResult(),
        error: null,
      });
    });
  });

  it("reapresenta cache válido restaurado do draft", async () => {
    const draft = buildDraft();
    const payloadSignature = resolveChampionshipBracketExactPreviewPayloadSignature(
      buildSetupPayloadFromDraft(draft),
    );

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: {
        ...draft,
        exact_preview_cache: {
          payload_signature: payloadSignature,
          generated_at: "2026-08-10T02:00:00.000Z",
          result: buildExactPreviewResult(),
        },
      },
      metadata: null,
      source: "remote",
    });

    renderPage();

    expect(await screen.findByText("Última simulação exata")).toBeInTheDocument();
    expect(screen.getByText(/Cache válido gerado em/i)).toBeInTheDocument();
    expect(screen.getByText("Jogos totais")).toBeInTheDocument();
  });

  it("marca o cache como desatualizado quando a assinatura mudou", async () => {
    const draft = buildDraft();

    fetchChampionshipBracketWizardDraftMock.mockResolvedValue({
      draft_form_values: {
        ...draft,
        exact_preview_cache: {
          payload_signature: "stale-signature",
          generated_at: "2026-08-10T02:00:00.000Z",
          result: buildExactPreviewResult(),
        },
      },
      metadata: null,
      source: "remote",
    });

    renderPage();

    expect(
      await screen.findByText("Última simulação exata desatualizada"),
    ).toBeInTheDocument();
    expect(screen.getByText("Prévia exata desatualizada")).toBeInTheDocument();
  });
});
