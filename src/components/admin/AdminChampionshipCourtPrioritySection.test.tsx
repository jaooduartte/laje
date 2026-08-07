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
  updateBracketLocationSportPriorities: vi.fn(),

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

    updateBracketLocationSportPriorities:
      mocks.updateBracketLocationSportPriorities,
  }),
);

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

function renderSection({
  onSaved = vi.fn(),
}: {
  onSaved?: ReturnType<typeof vi.fn>;
} = {}) {
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
      onSaved={onSaved}
    />,
  );

  return {
    onSaved,
  };
}

describe(
  "AdminChampionshipCourtPrioritySection",
  () => {
    beforeEach(() => {
      mocks.getBracketLocationSportPriorities
        .mockReset();

      mocks.updateBracketLocationSportPriorities
        .mockReset();

      mocks.toast.error.mockReset();
      mocks.toast.success.mockReset();
    });

    it(
      "aplica a prioridade global somente às quadras flexíveis",
      async () => {
        const priorityGroups: BracketLocationSportPriorityGroup[] =
          [
            {
              location_group_id: "location-1",
              location_name: "Arena",
              sport_id: "sport-1",
              priority_mode: "NONE",

              courts: [
                {
                  court_group_id:
                    "court-locked",

                  court_name:
                    "Quadra protegida",

                  position: 1,

                  sequence_modes: [
                    "GROUP_NAIPE",
                  ],

                  is_sequence_locked: true,
                },

                {
                  court_group_id:
                    "court-flexible",

                  court_name:
                    "Quadra flexível",

                  position: 2,

                  sequence_modes: [
                    "FLEXIBLE",
                  ],

                  is_sequence_locked: false,
                },
              ],
            },
          ];

        mocks.getBracketLocationSportPriorities
          .mockResolvedValue({
            data: priorityGroups,
            error: null,
          });

        mocks.updateBracketLocationSportPriorities
          .mockResolvedValue({
            error: null,
          });

        const { onSaved } = renderSection();

        await screen.findByText(
          "Arena • Basquetebol",
        );

        expect(
          screen.getByText(
            "Agrupado por naipe",
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            /Uma quadra mantém o sequenciamento definido na etapa 11/i,
          ),
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole("radio", {
            name: /Revezar por naipe/i,
          }),
        );

        await waitFor(() => {
          expect(
            screen.getByText("Masculino"),
          ).toBeInTheDocument();
        });

        expect(
          screen.queryByText("Feminino"),
        ).not.toBeInTheDocument();

        fireEvent.click(
          screen.getByRole("button", {
            name: "Salvar prioridades",
          }),
        );

        await waitFor(() => {
          expect(
            mocks
              .updateBracketLocationSportPriorities,
          ).toHaveBeenCalledWith(
            "edition-1",
            [
              {
                location_group_id:
                  "location-1",

                sport_id: "sport-1",

                priority_mode: "NAIPE",
              },
            ],
          );
        });

        await waitFor(() => {
          expect(onSaved).toHaveBeenCalled();
        });

        expect(
          mocks.toast.success,
        ).toHaveBeenCalledWith(
          "Prioridade global salva para Arena.",
        );
      },
    );

    it(
      "bloqueia a configuração global quando todas as quadras têm sequenciamento estrito",
      async () => {
        const priorityGroups: BracketLocationSportPriorityGroup[] =
          [
            {
              location_group_id: "location-1",
              location_name: "Arena",
              sport_id: "sport-1",
              priority_mode: "NONE",

              courts: [
                {
                  court_group_id:
                    "court-locked-1",

                  court_name:
                    "Quadra protegida 1",

                  position: 1,

                  sequence_modes: [
                    "GROUP_NAIPE",
                  ],

                  is_sequence_locked: true,
                },

                {
                  court_group_id:
                    "court-locked-2",

                  court_name:
                    "Quadra protegida 2",

                  position: 2,

                  sequence_modes: [
                    "GROUP_NAIPE",
                  ],

                  is_sequence_locked: true,
                },
              ],
            },
          ];

        mocks.getBracketLocationSportPriorities
          .mockResolvedValue({
            data: priorityGroups,
            error: null,
          });

        const { onSaved } = renderSection();

        await screen.findByText(
          "Arena • Basquetebol",
        );

        expect(
          screen.getByText(
            /2 quadras mantêm o sequenciamento definido na etapa 11/i,
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByRole("radio", {
            name: /Sem prioridade fixa/i,
          }),
        ).toBeDisabled();

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

        expect(
          mocks
            .updateBracketLocationSportPriorities,
        ).not.toHaveBeenCalled();

        expect(
          onSaved,
        ).not.toHaveBeenCalled();
      },
    );
  },
);