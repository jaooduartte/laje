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
  sequenceMode?:
    | "FLEXIBLE"
    | "GROUP_NAIPE"
    | "ALTERNATE_NAIPE"
    | "GROUP_DIVISION";
  preferredNaipe?: MatchNaipe | null;
}): BracketLocationSportPriorityGroup {
  const {
    bracketDayId,
    eventDate,
    locationGroupId,
    sequenceMode = "GROUP_NAIPE",
    preferredNaipe = MatchNaipe.MASCULINO,
  } = params;

  return {
    bracket_day_id: bracketDayId,
    event_date: eventDate,
    location_group_id: locationGroupId,
    location_name: "Arena",
    sport_id: "sport-1",
    priority_mode: "NONE",
    courts: [
      {
        bracket_court_id: `${bracketDayId}-court`,
        court_group_id: `${bracketDayId}-court-group`,
        court_name: "Quadra principal",
        position: 1,
        preferred_sport_id: "sport-1",
        is_primary_sport: true,
        preferred_naipe:
          sequenceMode === "FLEXIBLE"
            ? null
            : preferredNaipe,
        preferred_division: null,
        sequence_mode: sequenceMode,
        sequence_modes: [sequenceMode],
        is_sequence_locked: false,
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

  it("envia somente a data alterada no sequenciamento da quadra", async () => {
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

    expect(
      screen.getByText(
        /Configure o sequenciamento da modalidade/i,
      ),
    ).toBeInTheDocument();

    const alternateRadios = screen.getAllByRole("radio", {
      name: /Alternar naipes/i,
    });

    expect(alternateRadios).toHaveLength(2);

    fireEvent.click(alternateRadios[0]);

    expect(
      screen.getByText("1 alteração pendente"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar sequenciamento",
      }),
    );

    await waitFor(() => {
      expect(
        mocks.onRequestReconfiguration,
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      mocks.onRequestReconfiguration,
    ).toHaveBeenCalledWith({
      action: "COURT_SPORT_SEQUENCE",
      label: "Sequenciamento em Arena • Basquetebol",
      payload: {
        sequence_updates: [
          {
            bracket_court_id: "day-1-court",
            sport_id: "sport-1",
            sequence_mode: "ALTERNATE_NAIPE",
            preferred_naipe: MatchNaipe.MASCULINO,
            preferred_division: null,
          },
        ],
        sequence_changes: [
          {
            bracket_day_id: "day-1",
            bracket_court_id: "day-1-court",
            event_date: "2026-08-29",
            event_date_label: "29/08",
            court_name: "Quadra principal",
            current_sequence_mode: "GROUP_NAIPE",
            current_sequence_label:
              "Agrupar por naipe • inicia em Masculino",
            target_sequence_mode: "ALTERNATE_NAIPE",
            target_sequence_label:
              "Alternar naipes • inicia em Masculino",
          },
        ],
        location_name: "Arena",
        sport_id: "sport-1",
        sport_name: "Basquetebol",
        event_dates: ["2026-08-29"],
        event_date_labels: ["29/08"],
        occurrence_count: 1,
      },
    });
  });

  it("permite alternar naipes na própria quadra quando existe somente uma quadra configurada", async () => {
    mocks.getBracketLocationSportPriorities.mockResolvedValue({
      data: [
        buildPriorityOccurrence({
          bracketDayId: "day-1",
          eventDate: "2026-08-29",
          locationGroupId: "location-1",
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
      screen.getByText("Quadra principal"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: /Agrupar por naipe/i,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", {
        name: /Alternar naipes/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: /Flexível/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sem distribuição entre quadras"),
    ).not.toBeInTheDocument();
    expect(
      mocks.onRequestReconfiguration,
    ).not.toHaveBeenCalled();
  });

  it("remove o naipe inicial ao alterar o sequenciamento para flexível", async () => {
    mocks.getBracketLocationSportPriorities.mockResolvedValue({
      data: [
        buildPriorityOccurrence({
          bracketDayId: "day-1",
          eventDate: "2026-08-29",
          locationGroupId: "location-1",
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
        name: /Flexível/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar sequenciamento",
      }),
    );

    await waitFor(() => {
      expect(
        mocks.onRequestReconfiguration,
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      mocks.onRequestReconfiguration,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "COURT_SPORT_SEQUENCE",
        payload: expect.objectContaining({
          sequence_updates: [
            expect.objectContaining({
              bracket_court_id: "day-1-court",
              sequence_mode: "FLEXIBLE",
              preferred_naipe: null,
              preferred_division: null,
            }),
          ],
        }),
      }),
    );
  });
});
