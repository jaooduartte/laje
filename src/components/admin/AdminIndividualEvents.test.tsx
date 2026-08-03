import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminIndividualEvents } from "@/components/admin/AdminIndividualEvents";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipSchedulePeriod,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type {
  Championship,
  ChampionshipAthlete,
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  ChampionshipIndividualTeamStanding,
  Sport,
  Team,
} from "@/lib/types";

const {
  toastSuccessMock,
  toastErrorMock,
  syncChampionshipIndividualEventsFromSetupMock,
  syncChampionshipIndividualSessionsFromSetupMock,
  saveChampionshipAthleteMock,
  saveChampionshipIndividualEventResultsMock,
  useChampionshipIndividualEventsState,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  syncChampionshipIndividualEventsFromSetupMock: vi.fn(),
  syncChampionshipIndividualSessionsFromSetupMock: vi.fn(),
  saveChampionshipAthleteMock: vi.fn(),
  saveChampionshipIndividualEventResultsMock: vi.fn(),
  useChampionshipIndividualEventsState: {
    current: {
      events: [] as ChampionshipIndividualEvent[],
      sessions: [] as ChampionshipIndividualSession[],
      athletes: [] as ChampionshipAthlete[],
      entriesByEventId: {} as Record<string, ChampionshipIndividualEventEntry[]>,
      standings: [] as ChampionshipIndividualTeamStanding[],
      loading: false,
      refetch: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<(value: string) => void>(() => undefined);

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => undefined)}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsNavigationTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/IndividualSportStandingsTable", () => ({
  IndividualSportStandingsTable: () => <div data-testid="individual-standings-table-mock" />,
}));

vi.mock("@/hooks/useChampionshipIndividualEvents", () => ({
  useChampionshipIndividualEvents: () => useChampionshipIndividualEventsState.current,
}));

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  syncChampionshipIndividualEventsFromSetup: (...args: unknown[]) =>
    syncChampionshipIndividualEventsFromSetupMock(...args),
  syncChampionshipIndividualSessionsFromSetup: (...args: unknown[]) =>
    syncChampionshipIndividualSessionsFromSetupMock(...args),
  saveChampionshipAthlete: (...args: unknown[]) => saveChampionshipAthleteMock(...args),
  saveChampionshipIndividualEventResults: (...args: unknown[]) =>
    saveChampionshipIndividualEventResultsMock(...args),
  removeChampionshipAthlete: vi.fn(),
  removeChampionshipIndividualEventEntry: vi.fn(),
  saveChampionshipIndividualEvent: vi.fn(),
  saveChampionshipIndividualEventEntry: vi.fn(),
}));

function buildChampionship(): Championship {
  return {
    id: "championship-1",
    name: "Interlaje",
    code: "INTERLAJE",
    status: "IN_PROGRESS",
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-08-01T00:00:00.000Z",
  } as Championship;
}

function buildSports(): Sport[] {
  return [
    {
      id: "sport-1",
      name: "Atletismo",
      created_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "sport-2",
      name: "Natação",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ];
}

function buildTeams(): Team[] {
  return [
    {
      id: "team-1",
      name: "Atlética Ativa",
      city: "Joinville",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      is_active: true,
      created_at: "2026-08-01T00:00:00.000Z",
    } as Team,
    {
      id: "team-2",
      name: "Atlética Inativa",
      city: "Joinville",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      is_active: false,
      created_at: "2026-08-01T00:00:00.000Z",
    } as Team,
  ];
}

function renderAdminIndividualEvents(
  props?: Partial<ComponentProps<typeof AdminIndividualEvents>>,
) {
  render(
    <AdminIndividualEvents
      selectedChampionship={buildChampionship()}
      sports={buildSports()}
      teams={buildTeams()}
      canManageIndividualEvents
      usesDivisions
      {...props}
    />,
  );
}

describe("AdminIndividualEvents", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    syncChampionshipIndividualEventsFromSetupMock.mockReset();
    syncChampionshipIndividualSessionsFromSetupMock.mockReset();
    saveChampionshipAthleteMock.mockReset();
    saveChampionshipIndividualEventResultsMock.mockReset();
    useChampionshipIndividualEventsState.current = {
      events: [
        {
          id: "event-1",
          name: "100m",
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          kind: ChampionshipIndividualEventKind.INDIVIDUAL,
          scheduled_date: "2026-08-10",
          period: ChampionshipSchedulePeriod.MATUTINO,
          location: "Pista",
          status: ChampionshipIndividualEventStatus.SCHEDULED,
          sports: { id: "sport-1", name: "Atletismo" },
        },
      ],
      sessions: [],
      athletes: [
        {
          id: "athlete-1",
          name: "João",
          team_id: "team-1",
          sport_id: "sport-1",
          naipe: MatchNaipe.MASCULINO,
          division: TeamDivision.DIVISAO_PRINCIPAL,
          teams: { name: "Atlética Ativa" },
          sports: { name: "Atletismo" },
        },
      ],
      entriesByEventId: {
        "event-1": [
          {
            id: "entry-1",
            event_id: "event-1",
            team_id: "team-1",
            athlete_name: "João",
            status: ChampionshipIndividualEntryStatus.CONFIRMED,
            final_position: 1,
            points_awarded: 24,
            teams: { name: "Atlética Ativa" },
          },
          {
            id: "entry-2",
            event_id: "event-1",
            team_id: "team-1",
            athlete_name: "Pedro",
            status: ChampionshipIndividualEntryStatus.PENDING,
            final_position: null,
            points_awarded: 0,
            teams: { name: "Atlética Ativa" },
          },
        ],
      },
      standings: [],
      loading: false,
      refetch: vi.fn(),
    };

    syncChampionshipIndividualEventsFromSetupMock.mockResolvedValue({ error: null });
    syncChampionshipIndividualSessionsFromSetupMock.mockResolvedValue({ error: null });
    saveChampionshipAthleteMock.mockResolvedValue({ error: null });
    saveChampionshipIndividualEventResultsMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sincroniza provas e sessões oficiais e refaz a consulta", async () => {
    renderAdminIndividualEvents();

    fireEvent.click(screen.getByRole("button", { name: /Sincronizar provas oficiais/i }));

    await waitFor(() => {
      expect(syncChampionshipIndividualEventsFromSetupMock).toHaveBeenCalledWith("championship-1", 2026);
      expect(syncChampionshipIndividualSessionsFromSetupMock).toHaveBeenCalledWith("championship-1", 2026);
      expect(useChampionshipIndividualEventsState.current.refetch).toHaveBeenCalledTimes(1);
    });

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Provas e sessões oficiais sincronizadas com a configuração do campeonato.",
    );
  });

  it("cadastra atleta sem divisão quando o campeonato não usa divisões e oculta atléticas inativas", async () => {
    renderAdminIndividualEvents({ usesDivisions: false });

    expect(screen.queryByText("Atlética Inativa")).not.toBeInTheDocument();

    const athleteForm = screen.getByRole("button", { name: "Cadastrar" }).closest(".glass-panel");
    const athleteNameInput = within(athleteForm as HTMLElement).getByRole("textbox");

    fireEvent.change(athleteNameInput, {
      target: { value: "Maria" },
    });
    fireEvent.click(within(athleteForm as HTMLElement).getAllByRole("button", { name: "Atlética Ativa" })[0]!);
    fireEvent.click(within(athleteForm as HTMLElement).getAllByRole("button", { name: "Atletismo" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(saveChampionshipAthleteMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        sportId: "sport-1",
        teamId: "team-1",
        naipe: MatchNaipe.MASCULINO,
        division: null,
        name: "Maria",
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Atleta cadastrado.");
  });

  it("confirma resultados convertendo posições para número e preservando nulos", async () => {
    renderAdminIndividualEvents();

    await waitFor(() => {
      expect(screen.getByText("100m")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar resultados/i }));
    });

    await waitFor(() => {
      expect(saveChampionshipIndividualEventResultsMock).toHaveBeenCalledWith("event-1", [
        {
          entry_id: "entry-1",
          status: ChampionshipIndividualEntryStatus.CONFIRMED,
          final_position: 1,
        },
        {
          entry_id: "entry-2",
          status: ChampionshipIndividualEntryStatus.PENDING,
          final_position: null,
        },
      ]);
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Resultados confirmados.");
  });
});
