import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInterlajeOpeningCeremonyBonus } from "@/components/admin/AdminInterlajeOpeningCeremonyBonus";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";
import type { Championship, Team } from "@/lib/types";

const { saveEligibilityMock, savePointsMock, refetchMock } = vi.hoisted(() => ({
  saveEligibilityMock: vi.fn().mockResolvedValue({ error: null }),
  savePointsMock: vi.fn().mockResolvedValue({ error: null }),
  refetchMock: vi.fn().mockResolvedValue({ error: null }),
}));
const eligibleTeamIds: string[] = [];
const registeredTeamIds: string[] = [];

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
    loading: false,
    refetch: refetchMock,
  }),
}));

vi.mock("@/domain/interlaje/interlajeOpeningCeremonyBonus.repository", () => ({
  saveInterlajeOpeningCeremonyBonusEligibility: saveEligibilityMock,
  saveInterlajeOpeningCeremonyBonusPoints: savePointsMock,
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
    refetchMock.mockClear();
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
    fireEvent.click(screen.getByRole("button", { name: "Salvar pontos" }));

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
    expect(screen.getByRole("checkbox", { name: "Atlética A" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Salvar pontos" }),
    ).not.toBeInTheDocument();
  });
});
