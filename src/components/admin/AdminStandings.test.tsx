import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminStandings } from "@/components/admin/AdminStandings";
import {
  BracketThirdPlaceMode,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { Championship, ChampionshipBracketView, ChampionshipSport, Sport } from "@/lib/types";

const {
  rpcMock,
  rankingsMock,
  disqualificationsState,
  teamStandingsTableMock,
  interlajeOverallStandingsState,
  individualSessionRepositoryMocks,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  rankingsMock: {
    season_year: 2026,
    pending_matches_count: 0,
    pending_award_contexts: [],
    top_scorers: [
      {
        player_id: "player-1",
        player_name: "Artilheiro 1",
        team_id: "team-1",
        team_name: "Atlética A",
        naipe: "MASCULINO",
        division: "DIVISAO_PRINCIPAL",
        goals: 5,
        team_advancement_rank: 0,
      },
    ],
    best_defenses: [
      {
        team_id: "team-defense-1",
        team_name: "Atlética Defesa",
        naipe: "MASCULINO",
        division: "DIVISAO_PRINCIPAL",
        matches_count: 4,
        goals_against: 4,
        goals_against_average: 1,
      },
    ],
    award_draw_results: [],
  },
  disqualificationsState: {
    current: [],
  } as {
    current: Array<{
      team_id: string;
      sport_id: string;
      naipe: string;
      division: string | null;
    }>;
  },
  teamStandingsTableMock: vi.fn((_props: Record<string, unknown>) => (
    <div>Standings table</div>
  )),
  interlajeOverallStandingsState: {
    current: {
      standings: [],
      loading: false,
    },
  } as {
    current: {
      standings: Array<{
        team_id: string;
        team_name: string;
        placement_points: number;
        opening_bonus_points: number;
        overall_points: number;
        confirmed_competitions_count: number;
        has_pending_tie_break: boolean;
      }>;
      loading: boolean;
    };
  },
  individualSessionRepositoryMocks: {
    sessions: vi.fn(),
    participants: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    })),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/hooks/useStandings", () => ({
  useStandings: () => ({ standings: [], loading: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useInterlajeOverallStandings", () => ({
  useInterlajeOverallStandings: () => interlajeOverallStandingsState.current,
}));

vi.mock("@/hooks/useMatches", () => ({
  useMatches: () => ({ matches: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipBracketResolvedTieBreakOrders", () => ({
  useChampionshipBracketResolvedTieBreakOrders: () => ({ resolvedTieBreakOrders: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipCorrectedGroupStandings", () => ({
  useChampionshipCorrectedGroupStandings: () => ({ correctedGroupStandings: [], loading: false }),
}));

vi.mock("@/hooks/useChampionshipBracketHistory", () => ({
  useChampionshipBracketHistory: () => ({ championshipBracketSeasonViews: [] }),
}));

vi.mock("@/hooks/useCompetitionTeamDisqualifications", () => ({
  useCompetitionTeamDisqualifications: () => ({
    disqualifications: disqualificationsState.current,
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useChampionshipSeasonRuntime", () => ({
  useChampionshipSeasonRuntime: ({ championship }: { championship?: Championship }) => ({
    resolvedSeasonSettings: {
      division_format:
        championship?.code == ChampionshipCode.INTERLAJE
          ? "UNIFIED"
          : "SEPARATED",
      division_settlement_mode: "NONE",
      principal_slots_count: null,
      principal_relegation_count: null,
      access_promotion_count: null,
    },
    usesDivisions: championship?.code != ChampionshipCode.INTERLAJE,
    loading: false,
  }),
}));

vi.mock("@/hooks/useChampionshipAwardsRankings", async () => {
  const actualModule = await vi.importActual<typeof import("@/hooks/useChampionshipAwardsRankings")>(
    "@/hooks/useChampionshipAwardsRankings",
  );

  return {
    ...actualModule,
    useChampionshipAwardsRankings: () => ({
      rankings: rankingsMock,
      loading: false,
    }),
  };
});

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  fetchChampionshipIndividualSessions: (...args: unknown[]) =>
    individualSessionRepositoryMocks.sessions(...args),
  fetchChampionshipIndividualSessionParticipants: (...args: unknown[]) =>
    individualSessionRepositoryMocks.participants(...args),
}));

vi.mock("@/components/TeamStandingsTable", () => ({
  TeamStandingsTable: teamStandingsTableMock,
}));

vi.mock("@/components/SportFilter", () => ({
  SportFilter: ({ onSelect }: { onSelect: (value: string | null) => void }) => (
    <button type="button" onClick={() => onSelect("sport-1")}>
      Sport filter
    </button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  } | null>(null);

  return {
    Select: ({
      children,
      onValueChange,
      disabled = false,
    }: {
      children: ReactNode;
      value?: string;
      onValueChange?: (value: string) => void;
      disabled?: boolean;
    }) => (
      <SelectContext.Provider value={{ onValueChange, disabled }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({
      children,
      id,
    }: {
      children: ReactNode;
      id?: string;
      disabled?: boolean;
    }) => {
      const context = React.useContext(SelectContext);

      return (
      <button id={id} type="button" disabled={context?.disabled}>
        {children}
      </button>
      );
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? "Selecionado"}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const context = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => context?.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("AdminStandings", () => {
  const selectedChampionship: Championship = {
    id: "championship-1",
    code: ChampionshipCode.SOCIETY,
    name: "Copa Laje Society",
    status: ChampionshipStatus.UPCOMING,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-06-18T00:00:00.000Z",
  };

  const sports: Sport[] = [
    {
      id: "sport-1",
      name: "Futebol Society",
      created_at: "2026-06-18T00:00:00.000Z",
      default_match_duration_minutes: 40,
    },
  ];

  const championshipSports: ChampionshipSport[] = [
    {
      id: "championship-sport-1",
      championship_id: selectedChampionship.id,
      sport_id: "sport-1",
      naipe_mode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
      result_rule: ChampionshipSportResultRule.POINTS,
      supports_cards: true,
      tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
      default_match_duration_minutes: 40,
      show_estimated_start_time_on_cards: true,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      created_at: "2026-06-18T00:00:00.000Z",
      walkover_winner_points: null,
      awards_include_knockout_phase: true,
      supports_individual_awards: true,
    },
  ];

  const championshipBracketView: ChampionshipBracketView = {
    edition: null,
    competitions: [
      {
        id: "competition-1",
        sport_id: "sport-1",
        sport_name: "Futebol Society",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        groups_count: 1,
        qualifiers_per_group: 2,
        should_complete_knockout_with_best_second_placed_teams: false,
        third_place_mode: BracketThirdPlaceMode.NONE,
        groups: [
          {
            id: "group-1",
            group_number: 1,
            teams: [
              { team_id: "team-1", team_name: "Atlética A", team_city: "Joinville", position: 1 },
              { team_id: "team-2", team_name: "Atlética B", team_city: "Joinville", position: 2 },
            ],
            matches: [],
          },
        ],
        knockout_matches: [],
      },
    ],
  };

  beforeEach(() => {
    rpcMock.mockReset();
    teamStandingsTableMock.mockClear();
    disqualificationsState.current = [];
    interlajeOverallStandingsState.current = {
      standings: [],
      loading: false,
    };
    rankingsMock.top_scorers = [
      {
        player_id: "player-1",
        player_name: "Artilheiro 1",
        team_id: "team-1",
        team_name: "Atlética A",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 0,
      },
    ];
    rankingsMock.best_defenses = [
      {
        team_id: "team-defense-1",
        team_name: "Atlética Defesa",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        matches_count: 4,
        goals_against: 4,
        goals_against_average: 1,
      },
    ];
    rankingsMock.award_draw_results = [];
    individualSessionRepositoryMocks.sessions.mockReset();
    individualSessionRepositoryMocks.sessions.mockResolvedValue({
      data: [],
      error: null,
    });
    individualSessionRepositoryMocks.participants.mockReset();
    individualSessionRepositoryMocks.participants.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it("renderiza melhor defesa por atlética no admin", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    expect(screen.getByText("Melhores defesas")).toBeInTheDocument();
    expect(screen.getByText("Atlética Defesa")).toBeInTheDocument();
    expect(screen.getByText(/1,00 de média/)).toBeInTheDocument();
  });

  it("exibe a classificação geral do INTERLAJE no filtro Todas", () => {
    interlajeOverallStandingsState.current = {
      loading: false,
      standings: [
        {
          team_id: "team-1",
          team_name: "Atlética sem pontos",
          placement_points: 0,
          opening_bonus_points: 0,
          overall_points: 0,
          confirmed_competitions_count: 0,
          has_pending_tie_break: true,
        },
      ],
    };

    render(
      <AdminStandings
        selectedChampionship={{
          ...selectedChampionship,
          code: ChampionshipCode.INTERLAJE,
          name: "INTERLAJE",
        }}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    const lastCall = teamStandingsTableMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({
      variant: "public",
      standings: [expect.objectContaining({ team_id: "team-1", points: 0 })],
    });
    expect(lastCall?.[0].pendingTieBreakTeamIds).toEqual(new Set(["team-1"]));
    expect(screen.queryByText("Classificação geral do INTERLAJE")).not.toBeInTheDocument();
  });

  it("prioriza o artilheiro da equipe que avançou mais longe antes do sorteio", () => {
    rankingsMock.top_scorers = [
      {
        player_id: "player-final",
        player_name: "Artilheiro da Final",
        team_id: "team-final",
        team_name: "Atlética Finalista",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 3,
      },
      {
        player_id: "player-semi",
        player_name: "Artilheiro da Semi",
        team_id: "team-semi",
        team_name: "Atlética Semifinalista",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
        goals: 5,
        team_advancement_rank: 2,
      },
    ];

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    const finalScorer = screen.getByText("Artilheiro da Final");
    const semifinalScorer = screen.getByText("Artilheiro da Semi");

    expect(finalScorer.compareDocumentPosition(semifinalScorer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("exibe a ação de desclassificar sem depender dos filtros da tabela", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    expect(screen.getByRole("button", { name: "Desclassificar atlética" })).toBeInTheDocument();
  });

  it("oculta as ações da competição sem permissão para desclassificar", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
        canManageStandings={false}
      />,
    );

    expect(screen.queryByText("Ações da competição")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Desclassificar atlética" }),
    ).not.toBeInTheDocument();
  });

  it("permite desclassificar em revisão sem liberar movimentação de divisões", () => {
    render(
      <AdminStandings
        selectedChampionship={{
          ...selectedChampionship,
          status: ChampionshipStatus.REVIEW,
        }}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
        canManageStandings={false}
        canManageDisqualifications
      />,
    );

    expect(screen.getByRole("button", { name: "Desclassificar atlética" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prévia de divisões" })).not.toBeInTheDocument();
  });

  it("abre o formulário de desclassificação com os seletores da competição", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));

    expect(screen.getByText("Ano")).toBeInTheDocument();
    expect(screen.getByText("Modalidade")).toBeInTheDocument();
    expect(screen.getByText("Naipe")).toBeInTheDocument();
    expect(screen.queryByText("Divisão")).toBeNull();
    expect(screen.getByText("Atlética participante")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Futebol Society" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Masculino" }).at(-1)!);

    expect(screen.getByText("Divisão")).toBeInTheDocument();
  });

  it("bloqueia naipe e atlética até o recorte disponibilizar opções", () => {
    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));

    expect(
      document.querySelector("#competition-disqualification-naipe"),
    ).toBeDisabled();
    expect(
      document.querySelector("#competition-disqualification-team"),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Futebol Society" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Masculino" }).at(-1)!);
    fireEvent.click(screen.getAllByRole("button", { name: "Divisão Principal" }).at(-1)!);

    expect(
      document.querySelector("#competition-disqualification-team"),
    ).not.toBeDisabled();
  });

  it("oculta a divisão no formulário de desclassificação da temporada unificada", () => {
    render(
      <AdminStandings
        selectedChampionship={{
          ...selectedChampionship,
          code: ChampionshipCode.INTERLAJE,
          uses_divisions: false,
        }}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));

    expect(screen.queryByText("Divisão")).toBeNull();
  });

  it("usa os recortes individuais reais para ocultar a divisão", async () => {
    individualSessionRepositoryMocks.sessions.mockResolvedValue({
      data: [
        {
          id: "session-1",
          sport_id: "sport-swimming",
          naipe: MatchNaipe.FEMININO,
          division: null,
          sports: { name: "Natação" },
        },
      ],
      error: null,
    });
    individualSessionRepositoryMocks.participants.mockResolvedValue({
      data: [{ id: "team-3", name: "Atlética C" }],
      error: null,
    });

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Natação" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Feminino" }).at(-1)!);

    expect(screen.queryByText("Divisão")).toBeNull();
  });

  it("reutiliza os participantes individuais ao reabrir a desclassificação", async () => {
    individualSessionRepositoryMocks.sessions.mockResolvedValue({
      data: [
        {
          id: "session-1",
          sport_id: "sport-swimming",
          naipe: MatchNaipe.FEMININO,
          division: null,
          sports: { name: "Natação" },
        },
      ],
      error: null,
    });
    individualSessionRepositoryMocks.participants.mockResolvedValue({
      data: [{ id: "team-3", name: "Atlética C" }],
      error: null,
    });

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(individualSessionRepositoryMocks.sessions).toHaveBeenCalledTimes(1);
    expect(individualSessionRepositoryMocks.participants).toHaveBeenCalledTimes(1);
  });

  it("não confirma desclassificação sem seleção manual dos campos da competição", async () => {
    rpcMock.mockResolvedValue({ error: null });

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar desclassificação" }));
      await Promise.resolve();
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("mantém o badge de desclassificação mesmo com a modalidade em todas", () => {
    disqualificationsState.current = [
      {
        team_id: "team-2",
        sport_id: "sport-1",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_ACESSO,
      },
    ];

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Feminino" }));
    fireEvent.click(screen.getByRole("button", { name: "Divisão de Acesso" }));

    const lastCall = teamStandingsTableMock.mock.calls.at(-1);
    expect(lastCall?.[0].disqualifiedTeamKeys).toEqual(new Set(["team-2:DIVISAO_ACESSO"]));
  });

  it("chama o rpc de desclassificação com o recorte selecionado no formulário", async () => {
    rpcMock.mockResolvedValue({ error: null });

    render(
      <AdminStandings
        selectedChampionship={selectedChampionship}
        championshipSports={championshipSports}
        sports={sports}
        championshipBracketView={championshipBracketView}
        availableSeasonYears={[2026]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Desclassificar atlética" }));
    fireEvent.click(screen.getByRole("button", { name: "Futebol Society" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Masculino" }).at(-1)!);
    fireEvent.click(screen.getAllByRole("button", { name: "Divisão Principal" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Atlética B" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar desclassificação" }));
      await Promise.resolve();
    });

    expect(rpcMock).toHaveBeenCalledWith("disqualify_championship_team_competition", {
      _championship_id: "championship-1",
      _season_year: 2026,
      _sport_id: "sport-1",
      _naipe: MatchNaipe.MASCULINO,
      _division: TeamDivision.DIVISAO_PRINCIPAL,
      _team_id: "team-2",
    });
  });
});
