import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInterlajeOpeningCeremonyBonus } from "@/components/admin/AdminInterlajeOpeningCeremonyBonus";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";
import type { Championship, Team } from "@/lib/types";

const {
  saveEligibilityMock,
  savePointsMock,
  saveWalkoverCountsMock,
  saveWalkoverPointsMock,
  savePositionPointsMock,
  refetchMock,
  refetchPositionPointsMock,
} = vi.hoisted(() => ({
  saveEligibilityMock: vi.fn().mockResolvedValue({ error: null }),
  savePointsMock: vi.fn().mockResolvedValue({ error: null }),
  saveWalkoverCountsMock: vi.fn().mockResolvedValue({ error: null }),
  saveWalkoverPointsMock: vi.fn().mockResolvedValue({ error: null }),
  savePositionPointsMock: vi.fn().mockResolvedValue({ error: null }),
  refetchMock: vi.fn().mockResolvedValue({ error: null }),
  refetchPositionPointsMock: vi.fn().mockResolvedValue({ error: null }),
}));
const eligibleTeamIds: string[] = [];
const registeredTeamIds: string[] = [];
const walkoverCounts: Array<{ teamId: string; walkoverCount: number }> = [];
const positionPointSettings = Array.from({ length: 20 }, (_, index) => ({
  final_position: index + 1,
  points: 21 - index,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/useInterlajeOpeningCeremonyBonus", () => ({
  useInterlajeOpeningCeremonyBonus: () => ({
    settings: { points: 8 },
    eligibleTeamIds,
    registeredTeamIds,
    walkoverPenaltyPoints: 2,
    walkoverCounts,
    loading: false,
    refetch: refetchMock,
  }),
}));

vi.mock("@/domain/interlaje/interlajeOpeningCeremonyBonus.repository", () => ({
  saveInterlajeOpeningCeremonyBonusEligibility: saveEligibilityMock,
  saveInterlajeOpeningCeremonyBonusPoints: savePointsMock,
  saveInterlajeWalkoverPenaltyCounts: saveWalkoverCountsMock,
  saveInterlajeWalkoverPenaltyPoints: saveWalkoverPointsMock,
}));

vi.mock("@/domain/interlaje/interlajeOverallStandings.repository", () => ({
  saveInterlajePositionPointSettings: savePositionPointsMock,
}));

vi.mock("@/hooks/useInterlajePositionPointSettings", () => ({
  useInterlajePositionPointSettings: () => ({
    settings: positionPointSettings,
    loading: false,
    refetch: refetchPositionPointsMock,
  }),
}));

const teams: Team[] = [
  {
    id: "team-1",
    name: "Atlética A",
    city: "Joinville",
    division: null,
    created_at: "2026-08-23T00:00:00.000Z",
  },
  {
    id: "team-2",
    name: "Atlética não inscrita",
    city: "Joinville",
    division: null,
    created_at: "2026-08-23T00:00:00.000Z",
  },
  {
    id: "team-3",
    name: "Atlética inativa",
    city: "Joinville",
    division: null,
    created_at: "2026-08-23T00:00:00.000Z",
    is_active: false,
  },
];

function buildChampionship(status: ChampionshipStatus): Championship {
  return {
    id: "championship-1",
    code: ChampionshipCode.INTERLAJE,
    name: "INTERLAJE",
    status,
    current_season_year: 2026,
    uses_divisions: true,
    default_location: null,
    created_at: "2026-08-23T00:00:00.000Z",
  };
}

describe("AdminInterlajeOpeningCeremonyBonus", () => {
  beforeEach(() => {
    eligibleTeamIds.splice(0, eligibleTeamIds.length);
    registeredTeamIds.splice(0, registeredTeamIds.length, "team-1", "team-3");
    saveEligibilityMock.mockClear();
    savePointsMock.mockClear();
    saveWalkoverCountsMock.mockClear();
    saveWalkoverPointsMock.mockClear();
    savePositionPointsMock.mockClear();
    refetchMock.mockClear();
    refetchPositionPointsMock.mockClear();
    walkoverCounts.splice(0, walkoverCounts.length);
  });

  it("permite atualizar o valor e marcar atléticas em revisão", async () => {
    const onSaved = vi.fn();

    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.REVIEW)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={onSaved}
      />,
    );

    const pointsInput = screen.getByLabelText("Pontos");
    expect(pointsInput).toHaveAttribute("maxlength", "2");

    fireEvent.change(pointsInput, {
      target: { value: "123" },
    });
    expect(pointsInput).toHaveValue("12");

    fireEvent.change(pointsInput, {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar bônus" }));

    await waitFor(() => {
      expect(savePointsMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        points: 12,
      });
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Atlética A" }));
    expect(saveEligibilityMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Salvar atléticas" }));

    await waitFor(() => {
      expect(saveEligibilityMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        teamId: "team-1",
        eligible: true,
      });
    });
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("permite selecionar todas as atléticas antes de salvar", () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.REVIEW)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas" }));

    expect(screen.getByRole("checkbox", { name: "Atlética A" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Atlética não inscrita" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Atlética inativa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar atléticas" })).toBeEnabled();
  });

  it("lista somente atléticas ativas inscritas na edição da temporada", () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.REVIEW)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={() => undefined}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Atlética A" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Atlética não inscrita" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Atlética inativa" })).not.toBeInTheDocument();
  });

  it("mantém todos os controles bloqueados quando o campeonato está encerrado", () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.FINISHED)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Pontos")).toBeDisabled();
    expect(screen.getByLabelText("Pontos por W.O.")).toBeDisabled();
    expect(screen.getByLabelText("W.O. de Atlética A")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Atlética A" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Salvar bônus" }),
    ).not.toBeInTheDocument();
  });

  it("salva a pontuação e os contadores manuais de W.O. em lote", async () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.PLANNING)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={() => undefined}
      />,
    );

    const walkoverPointsInput = screen.getByLabelText("Pontos por W.O.");
    expect(walkoverPointsInput).toHaveAttribute("placeholder", "0");
    expect(screen.getByLabelText("W.O. de Atlética A")).toHaveAttribute(
      "placeholder",
      "0",
    );
    fireEvent.change(walkoverPointsInput, {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar penalidade" }));

    await waitFor(() => {
      expect(saveWalkoverPointsMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        points: 3,
      });
    });

    fireEvent.change(screen.getByLabelText("W.O. de Atlética A"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar penalidades" }));

    await waitFor(() => {
      expect(saveWalkoverCountsMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        counts: [{ teamId: "team-1", walkoverCount: 2 }],
      });
    });
  });

  it("salva os 20 valores da pontuação por colocação da temporada", async () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.IN_PROGRESS)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        availableSeasonYears={[2026]}
        onSaved={() => undefined}
      />,
    );

    expect(screen.getByLabelText("1º lugar")).toHaveValue("21");
    fireEvent.change(screen.getByLabelText("20º lugar"), {
      target: { value: "0" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar pontuação por colocação" }),
    );

    await waitFor(() => {
      expect(savePositionPointsMock).toHaveBeenCalledWith({
        championshipId: "championship-1",
        seasonYear: 2026,
        settings: expect.arrayContaining([
          { final_position: 1, points: 21 },
          { final_position: 20, points: 0 },
        ]),
      });
    });
  });

  it("agrupa o bônus com as atléticas presentes e ordena as colocações por coluna", () => {
    render(
      <AdminInterlajeOpeningCeremonyBonus
        selectedChampionship={buildChampionship(ChampionshipStatus.IN_PROGRESS)}
        teams={teams}
        loadingTeams={false}
        canManageOpeningCeremonyBonus
        onSaved={() => undefined}
      />,
    );

    const bonusCard = screen.getByText("Bônus da abertura").closest("section");
    expect(bonusCard).toContainElement(
      screen.getByText("Atléticas presentes na abertura"),
    );

    const positionPointsGrid = screen
      .getByLabelText("1º lugar")
      .parentElement?.parentElement;
    expect(positionPointsGrid).toHaveClass("sm:grid-flow-col", "xl:grid-rows-4");
  });
});
