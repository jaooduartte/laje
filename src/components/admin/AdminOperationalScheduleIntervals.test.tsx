import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOperationalScheduleIntervals } from "@/components/admin/AdminOperationalScheduleIntervals";
import type { BracketDaySchedule } from "@/domain/championship-brackets/championshipBracket.types";
import { ChampionshipStatus } from "@/lib/enums";

const componentSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/admin/AdminOperationalScheduleIntervals.tsx",
  ),
  "utf8",
);

const {
  applyOperationalScheduleIntervalMock,
  getBracketDaySchedulesMock,
  previewOperationalScheduleIntervalMock,
} = vi.hoisted(() => ({
  applyOperationalScheduleIntervalMock: vi.fn(),
  getBracketDaySchedulesMock: vi.fn(),
  previewOperationalScheduleIntervalMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/domain/championship-brackets/championshipBracket.repository", () => ({
  applyOperationalScheduleInterval: (...args: unknown[]) => applyOperationalScheduleIntervalMock(...args),
  getBracketDaySchedules: (...args: unknown[]) => getBracketDaySchedulesMock(...args),
  previewOperationalScheduleInterval: (...args: unknown[]) => previewOperationalScheduleIntervalMock(...args),
}));

const day: BracketDaySchedule = {
  id: "day-1",
  event_date: "2026-09-05",
  start_time: "08:00:00",
  end_time: "18:00:00",
  breaks: [{
    id: "general-break",
    bracket_day_id: "day-1",
    break_start_time: "12:00:00",
    break_end_time: "13:00:00",
    position: 1,
    scope_type: "ALL_COURTS",
    bracket_court_id: null,
  }],
  courts: [
    { id: "court-1", court_group_id: "court-group-1", name: "Quadra 1", position: 1, location_name: "Ginásio", label: "Ginásio • Quadra 1" },
    { id: "court-2", court_group_id: "court-group-2", name: "Quadra 2", position: 2, location_name: "Ginásio", label: "Ginásio • Quadra 2" },
  ],
  locations: [{
    id: "location-1",
    location_group_id: "location-group-1",
    name: "Ginásio",
    position: 1,
    courts: [
      { id: "court-1", court_group_id: "court-group-1", name: "Quadra 1", position: 1, location_name: "Ginásio", label: "Ginásio • Quadra 1" },
      { id: "court-2", court_group_id: "court-group-2", name: "Quadra 2", position: 2, location_name: "Ginásio", label: "Ginásio • Quadra 2" },
    ],
  }],
};

const preview = {
  revision: 4,
  blockers: [],
  timeline: [{
    item_id: "match-1",
    item_type: "MATCH" as const,
    match_status: "FINISHED",
    location_name: "Ginásio",
    court_name: "Quadra 1",
    label: "Atlética A × Atlética B",
    original_start_time: "2026-09-05T12:30:00-03:00",
    original_end_time: "2026-09-05T13:10:00-03:00",
    start_time: "2026-09-05T13:00:00-03:00",
    end_time: "2026-09-05T13:40:00-03:00",
    queue_position: 3,
    scheduled_slot: 3,
    is_displaced: true,
  }],
  breaks_before: [],
  breaks_after: [],
  day_end_before: "2026-09-05T18:00:00-03:00",
  day_end_after: "2026-09-05T18:30:00-03:00",
  extends_day_end: true,
};

function renderComponent() {
  return render(
    <AdminOperationalScheduleIntervals
      bracketEditionId="edition-1"
      championshipStatus={ChampionshipStatus.IN_PROGRESS}
      canManageSchedule
      onRefetchMatches={vi.fn()}
      onRefetchChampionshipBracket={vi.fn()}
    />,
  );
}

describe("AdminOperationalScheduleIntervals", () => {
  beforeEach(() => {
    getBracketDaySchedulesMock.mockReset();
    previewOperationalScheduleIntervalMock.mockReset();
    applyOperationalScheduleIntervalMock.mockReset();
    getBracketDaySchedulesMock.mockResolvedValue({ data: [day], error: null });
    previewOperationalScheduleIntervalMock.mockResolvedValue({ data: preview, error: null });
    applyOperationalScheduleIntervalMock.mockResolvedValue({ error: null });
  });

  it("offers general and selected-court interval operations", () => {
    expect(componentSource).toContain("Intervalo geral");
    expect(componentSource).toContain("Todas as quadras do dia");
    expect(componentSource).toContain("Quadras específicas");
    expect(componentSource).toContain("courtIds");
  });

  it("requires a preview and explicit day-end extension acceptance", () => {
    expect(componentSource).toContain("Gerar prévia");
    expect(componentSource).toContain("previewOperationalScheduleInterval");
    expect(componentSource).toContain("Confirmo a ampliação do horário final deste dia.");
    expect(componentSource).toContain("acceptDayEndExtension");
  });

  it("shows the prior and recalculated timeline before confirmation", () => {
    expect(componentSource).toContain("Prévia da programação");
    expect(componentSource).toContain("original_start_time");
    expect(componentSource).toContain("match_status");
    expect(componentSource).toContain("Confirmar ajuste");
  });

  it("gera prévia para intervalo geral no dia selecionado", async () => {
    renderComponent();

    expect(await screen.findByText("Locais e intervalos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intervalo geral" }));
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "14:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "14:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" }));

    await waitFor(() => {
      expect(previewOperationalScheduleIntervalMock).toHaveBeenCalledWith(
        "edition-1",
        expect.objectContaining({
          event_date: "2026-09-05",
          action: "UPSERT",
          scope_type: "ALL_COURTS",
          court_ids: [],
        }),
      );
    });
  });

  it("seleciona mais de uma quadra e exige aceite para confirmar a extensão", async () => {
    renderComponent();

    await screen.findByText("Quadra 1");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar intervalo em Quadra 1" }));
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "14:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "14:20" } });
    fireEvent.click(screen.getByLabelText("Ginásio • Quadra 2"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" }));

    expect(await screen.findByText("Prévia da programação")).toBeInTheDocument();
    expect(screen.getByText(/Encerrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar ajuste" })).toBeDisabled();

    fireEvent.click(screen.getByText("Confirmo a ampliação do horário final deste dia."));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));

    await waitFor(() => {
      expect(applyOperationalScheduleIntervalMock).toHaveBeenCalledWith(
        "edition-1",
        expect.objectContaining({
          scope_type: "COURT",
          court_ids: ["court-1", "court-2"],
        }),
        4,
      );
    });
  });

  it("exibe edição e remoção para intervalos existentes", async () => {
    renderComponent();

    expect(await screen.findByLabelText("Editar intervalo geral")).toBeInTheDocument();
    expect(screen.getByLabelText("Remover intervalo geral")).toBeInTheDocument();
  });
});
