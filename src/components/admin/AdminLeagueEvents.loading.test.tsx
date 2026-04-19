import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLeagueEvents } from "@/components/admin/AdminLeagueEvents";
import { LeagueEventOrganizerType, LeagueEventType, TeamDivision } from "@/lib/enums";
import type { LeagueEvent, Team } from "@/lib/types";

const {
  toastSuccessMock,
  toastErrorMock,
  createLeagueEventMock,
  updateLeagueEventMock,
  deleteLeagueEventMock,
  fetchLeagueEventsByDateRangeMock,
  upsertLeagueEventMock,
  removeLeagueEventMock,
  mockedLeagueEvents,
  createDelay,
  updateDelay,
  deleteDelay,
  createResolver,
  updateResolver,
  deleteResolver,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  createLeagueEventMock: vi.fn(),
  updateLeagueEventMock: vi.fn(),
  deleteLeagueEventMock: vi.fn(),
  fetchLeagueEventsByDateRangeMock: vi.fn(),
  upsertLeagueEventMock: vi.fn(),
  removeLeagueEventMock: vi.fn(),
  mockedLeagueEvents: { current: [] as LeagueEvent[] },
  createDelay: { value: false },
  updateDelay: { value: false },
  deleteDelay: { value: false },
  createResolver: { current: null as (() => void) | null },
  updateResolver: { current: null as (() => void) | null },
  deleteResolver: { current: null as (() => void) | null },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useLeagueEvents", () => ({
  useLeagueEvents: () => ({
    leagueEvents: mockedLeagueEvents.current,
    loading: false,
    upsertLeagueEvent: upsertLeagueEventMock,
    removeLeagueEvent: removeLeagueEventMock,
  }),
}));

vi.mock("@/domain/league-events/leagueEvent.repository", () => ({
  createLeagueEvent: (...args: unknown[]) => createLeagueEventMock(...args),
  updateLeagueEvent: (...args: unknown[]) => updateLeagueEventMock(...args),
  deleteLeagueEvent: (...args: unknown[]) => deleteLeagueEventMock(...args),
  fetchLeagueEventsByDateRange: (...args: unknown[]) => fetchLeagueEventsByDateRangeMock(...args),
}));

vi.mock("@/domain/league-events/LeagueEventSaveDTO", () => ({
  LeagueEventSaveDTO: class LeagueEventSaveDTOMock {
    static fromFormValues() {
      return new LeagueEventSaveDTOMock();
    }

    bindToSave() {
      return {
        name: "Evento teste",
        event_type: LeagueEventType.LAJE_EVENT,
        organizer_type: LeagueEventOrganizerType.LAJE,
        organizer_team_id: null,
        location: "Praia de Piçarras",
        event_date: "2026-04-12",
      };
    }

    resolveOrganizerTeamIds() {
      return [];
    }
  },
}));

function buildTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Joinville",
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    created_at: overrides.created_at ?? "2026-04-12T00:00:00.000Z",
  };
}

function buildLeagueEvent(overrides: Partial<LeagueEvent> & Pick<LeagueEvent, "id" | "name">): LeagueEvent {
  return {
    id: overrides.id,
    name: overrides.name,
    event_type: overrides.event_type ?? LeagueEventType.LAJE_EVENT,
    organizer_type: overrides.organizer_type ?? LeagueEventOrganizerType.LAJE,
    organizer_team_id: overrides.organizer_team_id ?? null,
    location: overrides.location ?? "Praia de Piçarras",
    event_date: overrides.event_date ?? "2026-04-12",
    created_at: overrides.created_at ?? "2026-04-12T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-12T00:00:00.000Z",
    organizer_team: overrides.organizer_team ?? null,
    organizer_teams: overrides.organizer_teams ?? [],
  };
}

function renderAdminLeagueEvents() {
  render(
    <AdminLeagueEvents
      teams={[buildTeam({ id: "team-1", name: "ATLÉTICA 1" })]}
      canManageLeagueEvents
    />,
  );
}

describe("AdminLeagueEvents loading states", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    createLeagueEventMock.mockReset();
    updateLeagueEventMock.mockReset();
    deleteLeagueEventMock.mockReset();
    fetchLeagueEventsByDateRangeMock.mockReset();
    upsertLeagueEventMock.mockReset();
    removeLeagueEventMock.mockReset();
    createDelay.value = false;
    updateDelay.value = false;
    deleteDelay.value = false;
    createResolver.current = null;
    updateResolver.current = null;
    deleteResolver.current = null;

    mockedLeagueEvents.current = [
      buildLeagueEvent({ id: "league-event-1", name: "Evento 1" }),
    ];

    fetchLeagueEventsByDateRangeMock.mockResolvedValue({ data: [], error: null });
    createLeagueEventMock.mockImplementation(async () => {
      if (createDelay.value) {
        await new Promise<void>((resolve) => {
          createResolver.current = resolve;
        });
      }

      return {
        data: buildLeagueEvent({ id: "created-event", name: "Evento criado" }),
        error: null,
      };
    });
    updateLeagueEventMock.mockImplementation(async () => {
      if (updateDelay.value) {
        await new Promise<void>((resolve) => {
          updateResolver.current = resolve;
        });
      }

      return {
        data: buildLeagueEvent({ id: "updated-event", name: "Evento atualizado" }),
        error: null,
      };
    });
    deleteLeagueEventMock.mockImplementation(async () => {
      if (deleteDelay.value) {
        await new Promise<void>((resolve) => {
          deleteResolver.current = resolve;
        });
      }

      return { error: null };
    });
  });

  afterEach(() => {
    createDelay.value = false;
    updateDelay.value = false;
    deleteDelay.value = false;
    createResolver.current = null;
    updateResolver.current = null;
    deleteResolver.current = null;
    vi.clearAllMocks();
  });

  it("mostra loading ao criar evento", async () => {
    createDelay.value = true;
    renderAdminLeagueEvents();

    fireEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    const createButtons = screen.getAllByRole("button", { name: "Criar evento" });
    const createSubmitButton = createButtons[createButtons.length - 1];

    fireEvent.click(createSubmitButton);

    await waitFor(() => {
      expect(createSubmitButton).toBeDisabled();
      expect(createSubmitButton.querySelector("svg.animate-spin")).not.toBeNull();
    });

    await act(async () => {
      createResolver.current?.();
    });

    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: "Criar evento" }).every((button) => button.querySelector("svg.animate-spin") == null)).toBe(true);
      expect(upsertLeagueEventMock).toHaveBeenCalled();
    });
  });

  it("mostra loading ao salvar edição do evento", async () => {
    updateDelay.value = true;
    renderAdminLeagueEvents();

    const editIcon = document.querySelector(".lucide-pencil");
    const editButton = editIcon?.closest("button");
    expect(editButton).not.toBeNull();
    fireEvent.click(editButton as HTMLButtonElement);

    const saveButton = await screen.findByRole("button", { name: "Salvar alterações" });
    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      updateResolver.current?.();
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
      expect(upsertLeagueEventMock).toHaveBeenCalled();
    });
  });

  it("mostra loading ao excluir evento", async () => {
    deleteDelay.value = true;
    renderAdminLeagueEvents();

    const deleteIcon = document.querySelector(".lucide-trash2, .lucide-trash-2");
    const deleteButton = deleteIcon?.closest("button");
    expect(deleteButton).not.toBeNull();

    fireEvent.click(deleteButton as HTMLButtonElement);

    expect((deleteButton as HTMLButtonElement).querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      deleteResolver.current?.();
    });

    await waitFor(() => {
      expect((deleteButton as HTMLButtonElement).querySelector("svg.animate-spin")).toBeNull();
      expect(removeLeagueEventMock).toHaveBeenCalledWith("league-event-1");
    });
  });

  it("mostra loading ao confirmar criação com conflito de data", async () => {
    createDelay.value = true;
    fetchLeagueEventsByDateRangeMock.mockResolvedValueOnce({
      data: [buildLeagueEvent({ id: "conflict-1", name: "Evento existente na data" })],
      error: null,
    });

    renderAdminLeagueEvents();

    fireEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    const createButtons = screen.getAllByRole("button", { name: "Criar evento" });
    fireEvent.click(createButtons[createButtons.length - 1]);

    const alertDialog = await screen.findByRole("alertdialog");
    const confirmCreateButton = within(alertDialog).getByRole("button", { name: "Criar" });
    fireEvent.click(confirmCreateButton);

    expect(confirmCreateButton).toBeDisabled();
    expect(confirmCreateButton.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      createResolver.current?.();
    });

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(createLeagueEventMock).toHaveBeenCalledTimes(1);
    });
  });
});
