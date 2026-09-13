import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminIndividualSessionResultsDialog } from "@/components/admin/AdminIndividualSessionResultsDialog";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipIndividualSessionStatus,
  MatchNaipe,
} from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  Team,
} from "@/lib/types";

const fetchPlacementCountMock = vi.fn();
const saveTeamPlacementsMock = vi.fn();

vi.mock("@/domain/individual-events/championshipIndividualEvents.repository", () => ({
  fetchChampionshipIndividualEventPlacementCount: (...args: unknown[]) =>
    fetchPlacementCountMock(...args),
  saveChampionshipIndividualEventTeamPlacements: (...args: unknown[]) =>
    saveTeamPlacementsMock(...args),
}));

const session: ChampionshipIndividualSession = {
  id: "session-1",
  championship_id: "championship-1",
  season_year: 2026,
  sport_id: "sport-1",
  naipe: MatchNaipe.FEMININO,
  division: null,
  scheduled_date: "2026-09-12",
  period: null,
  start_time: null,
  end_time: null,
  location_key: "pool",
  court_key: "lane",
  location_name: "Piscina",
  court_name: "Raia",
  status: ChampionshipIndividualSessionStatus.LIVE,
  exclusive_lock_enabled: false,
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
  sports: {
    id: "sport-1",
    name: "Natação",
    icon: null,
    is_active: true,
    created_at: "2026-09-12T00:00:00.000Z",
  },
};

const event: ChampionshipIndividualEvent = {
  id: "event-1",
  session_id: session.id,
  championship_id: session.championship_id,
  season_year: session.season_year,
  sport_id: session.sport_id,
  naipe: session.naipe,
  division: null,
  event_code: "SWIMMING_50_FREE",
  name: "50m crawl",
  kind: ChampionshipIndividualEventKind.INDIVIDUAL,
  display_order: 1,
  scheduled_date: session.scheduled_date,
  period: null,
  location: "Piscina",
  status: ChampionshipIndividualEventStatus.SCHEDULED,
  relay_multiplier: 2,
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

const registeredEvent: ChampionshipIndividualEvent = {
  ...event,
  id: "event-2",
  event_code: "SWIMMING_100_FREE",
  name: "100m livre",
  display_order: 2,
};

const registeredEntry: ChampionshipIndividualEventEntry = {
  id: "entry-1",
  event_id: registeredEvent.id,
  team_id: "team-1",
  athlete_id: null,
  athlete_name: null,
  entry_type: ChampionshipIndividualEventKind.INDIVIDUAL,
  lane_number: null,
  status: ChampionshipIndividualEntryStatus.CONFIRMED,
  final_position: 1,
  points_awarded: 10,
  result_time_milliseconds: null,
  result_mark_centimeters: null,
  attempt_one_centimeters: null,
  attempt_two_centimeters: null,
  attempt_three_centimeters: null,
  recording_mode: "TEAM_PLACEMENT",
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

const teams: Team[] = [
  {
    id: "team-1",
    name: "Atlética A",
    short_name: "AA",
    city: null,
    state: null,
    is_active: true,
    created_at: "2026-09-12T00:00:00.000Z",
  },
  {
    id: "team-2",
    name: "Atlética B",
    short_name: "AB",
    city: null,
    state: null,
    is_active: true,
    created_at: "2026-09-12T00:00:00.000Z",
  },
];

describe("AdminIndividualSessionResultsDialog", () => {
  it("mostra as provas em abas, sinaliza as registradas e mantém o W.O. por prova", async () => {
    fetchPlacementCountMock.mockResolvedValue({ data: 5, error: null });

    render(
      <AdminIndividualSessionResultsDialog
        open
        onOpenChange={vi.fn()}
        session={session}
        events={[event, registeredEvent]}
        entries={[registeredEntry]}
        teams={teams}
        isLoading={false}
        canManage
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("1ª colocação")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("5ª colocação")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "50m crawl" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: "100m livre — classificação registrada",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Prova")).toBeNull();
    expect(screen.getByText("W.O. na prova")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atlética A" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByText("Cadastrar atleta")).toBeNull();
    expect(screen.queryByText("Tempo (ms)")).toBeNull();
  });

  it("mantém a classificação não salva quando o Controle ao Vivo atualiza as entradas", async () => {
    fetchPlacementCountMock.mockResolvedValue({ data: 5, error: null });

    const dialogProps = {
      open: true,
      onOpenChange: vi.fn(),
      session,
      events: [event],
      teams,
      isLoading: false,
      canManage: true,
      onSaved: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(
      <AdminIndividualSessionResultsDialog {...dialogProps} entries={[]} />,
    );

    const firstPlacement = await screen.findByLabelText("1ª colocação");
    fireEvent.click(firstPlacement);
    fireEvent.click(await screen.findByRole("option", { name: "Atlética A" }));

    await waitFor(() => {
      expect(screen.getByLabelText("1ª colocação")).toHaveTextContent("Atlética A");
    });

    rerender(
      <AdminIndividualSessionResultsDialog {...dialogProps} entries={[]} />,
    );

    expect(screen.getByLabelText("1ª colocação")).toHaveTextContent("Atlética A");
  });

  it("bloqueia o W.O. da atlética já posicionada na prova", async () => {
    fetchPlacementCountMock.mockResolvedValue({ data: 5, error: null });

    render(
      <AdminIndividualSessionResultsDialog
        open
        onOpenChange={vi.fn()}
        session={session}
        events={[event]}
        entries={[]}
        teams={teams}
        isLoading={false}
        canManage
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const firstPlacement = await screen.findByLabelText("1ª colocação");
    fireEvent.click(firstPlacement);
    fireEvent.click(await screen.findByRole("option", { name: "Atlética A" }));

    expect(screen.getByRole("button", { name: "Atlética A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Atlética B" })).toBeEnabled();
  });

  it("mantém somente o ícone vermelho enquanto carrega a classificação", async () => {
    fetchPlacementCountMock.mockReturnValue(new Promise(() => undefined));

    render(
      <AdminIndividualSessionResultsDialog
        open
        onOpenChange={vi.fn()}
        session={session}
        events={[event]}
        entries={[]}
        teams={teams}
        isLoading={false}
        canManage
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      await screen.findByLabelText("Carregando classificação da prova"),
    ).toHaveClass("text-primary");
    expect(screen.queryByText("Carregando classificação da prova...")).toBeNull();
  });
});
