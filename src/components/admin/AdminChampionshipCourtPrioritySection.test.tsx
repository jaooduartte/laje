import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AdminChampionshipCourtPrioritySection,
} from "@/components/admin/AdminChampionshipCourtPrioritySection";
import type {
  BracketLocationSportPriorityGroup,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  MatchNaipe,
} from "@/lib/enums";

const mocks = vi.hoisted(() => ({
  getBracketLocationSportPriorities: vi.fn(),
  onRequestReconfiguration: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock(
  "@/domain/championship-brackets/championshipBracket.repository",
  () => ({
    getBracketLocationSportPriorities:
      mocks.getBracketLocationSportPriorities,
  }),
);

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

function renderSection() {
  render(
    <AdminChampionshipCourtPrioritySection
      bracketEditionId="edition-1"
      isEditable
      usesDivisions={false}
      sportNameBySportId={{
        "sport-1": "Basquetebol",
      }}
      naipeOptionsBySportId={{
        "sport-1": [
          MatchNaipe.MASCULINO,
          MatchNaipe.FEMININO,
        ],
      }}
      divisionOptionsBySportId={{
        "sport-1": [],
      }}
      onRequestReconfiguration={mocks.onRequestReconfiguration}
    />,
  );
}

function buildPriorityOccurrence(params: {
  bracketDayId: string;
  eventDate: string;
  locationGroupId: string;
  priorityMode?: "NONE" | "NAIPE" | "DIVISION";
  allLocked?: boolean;
}): BracketLocationSportPriorityGroup {
  const {
    bracketDayId,
    eventDate,
    locationGroupId,
    priorityMode = "NONE",
    allLocked = false,
  } = params;

  return {
    bracket_day_id: bracketDayId,
    event_date: eventDate,
    location_group_id: locationGroupId,
    location_name: "Arena",
    sport_id: "sport-1",
    priority_mode: priorityMode,
    courts: [
      {
        court_group_id: `${bracketDayId}-locked`,
        court_name: "Quadra protegida",
        position: 1,
        preferred_naipe: MatchNaipe.MASCULINO,
        preferred_division: null,
        sequence_modes: ["GROUP_NAIPE"],
        is_sequence_locked: true,
      },
      {
        court_group_id: `${bracketDayId}-flexible`,
        court_name: allLocked ? "Quadra protegida 2" : "Quadra flexível",
        position: 2,
        preferred_naipe: null,
        preferred_division: null,
        sequence_modes: [allLocked ? "GROUP_NAIPE" : "FLEXIBLE"],
        is_sequence_locked: allLocked,
      },
    ],
  };
}

describe("AdminChampionshipCourtPrioritySection", () => {
  beforeEach(() => {
    mocks.getBracketLocationSportPriorities.mockReset();
    mocks.onRequestReconfiguration.mockReset();
    mocks.toast.error.mockReset();
    mocks.toast.success.mockReset();
  });

  it("envia o contexto consolidado no preview de prioridade", async () => {
    mocks.getBracketLocationSportPriorities.mockResolvedValue({
      data: [
        buildPriorityOccurrence({
          bracketDayId: "day-1",
          eventDate: "2026-08-29",
          locationGroupId: "location-1",
        }),
        buildPriorityOccurrence({
          bracketDayId: "day-2",
          eventDate: "2026-08-30",
          locationGroupId: "location-2",
        }),
      ],
      error: null,
    });
    mocks.onRequestReconfiguration.mockResolvedValue(true);

    renderSection();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Arena.*Basquetebol/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("radio", {
        name: /Revezar por naipe/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar prioridades",
      }),
    );

    await waitFor(() => {
      expect(mocks.onRequestReconfiguration).toHaveBeenCalledWith({
        action: "LOCATION_SPORT_PRIORITIES",
        label: "Prioridade de quadras em Arena • Basquetebol",
        payload: {
          priority_updates: [
            {
              location_group_id: "location-1",
              sport_id: "sport-1",
              priority_mode: "NAIPE",
            },
            {
              location_group_id: "location-2",
              sport_id: "sport-1",
              priority_mode: "NAIPE",
            },
          ],
          location_name: "Arena",
          sport_name: "Basquetebol",
          occurrence_count: 2,
          event_dates: ["2026-08-29", "2026-08-30"],
          event_date_labels: ["29/08", "30/08"],
          current_priority_mode: "NONE",
          current_priority_label: "Sem prioridade fixa",
          target_priority_mode: "NAIPE",
          target_priority_label: "Revezar por naipe",
          protected_court_count: 2,
        },
      });
    });
  });

  it("mantém a configuração global indisponível sem quadras flexíveis", async () => {
    mocks.getBracketLocationSportPriorities.mockResolvedValue({
      data: [
        buildPriorityOccurrence({
          bracketDayId: "day-1",
          eventDate: "2026-08-29",
          locationGroupId: "location-1",
          allLocked: true,
        }),
      ],
      error: null,
    });

    renderSection();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Arena.*Basquetebol/i,
      }),
    );

    expect(
      screen.getByText(
        /2 quadras mantêm o sequenciamento definido na etapa 11/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: /Revezar por naipe/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Salvar prioridades",
      }),
    ).toBeDisabled();
  });
});
